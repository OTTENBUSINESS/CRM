import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Phone, PhoneOff, MessageSquare, ArrowRight, Target, Building2, Zap, Send, CheckCircle2, Edit3, Plus, Clock, Search, SlidersHorizontal, X, ExternalLink, PhoneIncoming, PhoneOutgoing, History, MessageCircle, Sparkles, Loader2, CalendarDays, AlertTriangle, Video, Check, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCall } from '@/contexts/CallContext';
import { useCockpitQueue, generateNotAnsweredMessages, generateFollowUpTask, ALL_COCKPIT_STAGES, CockpitFilters } from '@/hooks/useCallCockpit';
import { useCallHistory } from '@/hooks/useWavoip';
import { useCreateTask, useCompleteTask } from '@/hooks/useTasks';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type CockpitMode = 'sdr' | 'closer';
type FlowState = 'idle' | 'calling_1' | 'calling_2' | 'not_answered';

// Hook to fetch last WhatsApp messages for a lead (ascending for chat view)
function useLeadLastMessages(leadId: string | null) {
  return useQuery({
    queryKey: ['cockpit-lead-messages', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      // Fetch last 50 in descending, then reverse for chronological display
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('id, content, is_from_me, sent_at, message_type')
        .eq('lead_id', leadId)
        .order('sent_at', { ascending: false })
        .limit(50);
      return (data || []).reverse();
    },
    enabled: !!leadId,
    refetchInterval: 10000,
  });
}

// Hook to fetch today's agenda (tasks + overdue) for the team member
function useCockpitAgenda(memberId: string | undefined) {
  return useQuery({
    queryKey: ['cockpit-agenda', memberId],
    queryFn: async () => {
      if (!memberId) return { today: [], overdue: [] };
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      // Today's tasks
      const { data: todayTasks } = await supabase
        .from('company_activities')
        .select('id, name, task_type, priority, scheduled_at, status, lead_id, meeting_link, lead:leads!company_activities_lead_id_fkey(id, name, phone)')
        .eq('responsavel_id', memberId)
        .eq('completed', false)
        .gte('scheduled_at', `${todayStr}T00:00:00`)
        .lte('scheduled_at', `${todayStr}T23:59:59`)
        .order('scheduled_at', { ascending: true })
        .limit(20);

      // Overdue tasks (scheduled before today, not completed)
      const { data: overdueTasks } = await supabase
        .from('company_activities')
        .select('id, name, task_type, priority, scheduled_at, status, lead_id, meeting_link, lead:leads!company_activities_lead_id_fkey(id, name, phone)')
        .eq('responsavel_id', memberId)
        .eq('completed', false)
        .lt('scheduled_at', `${todayStr}T00:00:00`)
        .not('scheduled_at', 'is', null)
        .order('scheduled_at', { ascending: false })
        .limit(10);

      return {
        today: (todayTasks || []) as any[],
        overdue: (overdueTasks || []) as any[],
      };
    },
    enabled: !!memberId,
    refetchInterval: 60000,
  });
}

const taskTypeIcon: Record<string, { icon: React.ElementType; color: string }> = {
  call: { icon: Phone, color: 'text-blue-400' },
  meeting: { icon: Video, color: 'text-indigo-400' },
  whatsapp: { icon: MessageSquare, color: 'text-green-400' },
  onboarding: { icon: Target, color: 'text-orange-400' },
  follow_up: { icon: Clock, color: 'text-yellow-400' },
};

function AgendaItem({ task, isOverdue, onClickLead, onComplete, onOpenLead }: {
  task: any;
  isOverdue?: boolean;
  onClickLead: (leadId: string) => void;
  onComplete: (taskId: string) => void;
  onOpenLead: (leadId: string) => void;
}) {
  const config = taskTypeIcon[task.task_type] || { icon: CheckCircle2, color: 'text-zinc-400' };
  const Icon = config.icon;
  const time = task.scheduled_at ? format(new Date(task.scheduled_at), 'HH:mm') : '--:--';
  const leadName = task.lead?.name ? task.lead.name.split(' ')[0] : null;

  return (
    <div
      className={cn(
        'w-full text-left px-2 py-1.5 rounded-md hover:bg-zinc-800/50 transition-colors flex items-start gap-2 group',
        isOverdue && 'bg-red-500/5'
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', isOverdue ? 'text-red-400' : config.color)} />
      <button
        onClick={() => task.lead_id && onClickLead(task.lead_id)}
        className="min-w-0 flex-1 text-left"
      >
        <p className={cn('text-[11px] font-medium truncate', isOverdue ? 'text-red-300' : 'text-zinc-300')}>
          {task.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn('text-[10px]', isOverdue ? 'text-red-500' : 'text-zinc-500')}>{time}</span>
          {leadName && (
            <span className="text-[10px] text-zinc-600 truncate">{leadName}</span>
          )}
          {task.priority === 'high' && (
            <span className="text-[9px] text-red-500">!</span>
          )}
        </div>
        {isOverdue && task.scheduled_at && (
          <p className="text-[9px] text-red-600">
            {formatDistanceToNow(new Date(task.scheduled_at), { addSuffix: true, locale: ptBR })}
          </p>
        )}
      </button>
      {/* Action buttons - visible on hover */}
      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.lead_id && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenLead(task.lead_id); }}
            className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-blue-400 transition-colors"
            title="Ver lead"
          >
            <User className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
          className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-green-400 transition-colors"
          title="Concluir tarefa"
        >
          <Check className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function CallExecutionContent() {
  const { teamMember } = useAuth();
  const { initiateCall, activeCall, showCallEndedModal, setShowActiveCallModal } = useCall();
  const { toast } = useToast();
  const createTask = useCreateTask();
  const completeTask = useCompleteTask();

  // Mode
  const defaultMode: CockpitMode = teamMember?.role === 'closer' ? 'closer' : 'sdr';
  const [mode, setMode] = useState<CockpitMode>(defaultMode);

  // Filters
  const [filters, setFilters] = useState<CockpitFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const availableStages = ALL_COCKPIT_STAGES[mode];

  const { data: queue = [], isLoading } = useCockpitQueue(mode, teamMember?.id, filters);
  const { data: agenda } = useCockpitAgenda(teamMember?.id);

  // Skipped leads — persisted in sessionStorage so page reload remembers
  const SKIPPED_KEY = `cockpit-skipped-${teamMember?.id || 'anon'}`;
  const [skippedDealIds, setSkippedDealIds] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem(SKIPPED_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const skipDeal = useCallback((dealId: string) => {
    setSkippedDealIds(prev => {
      const next = new Set(prev);
      next.add(dealId);
      sessionStorage.setItem(SKIPPED_KEY, JSON.stringify([...next]));
      return next;
    });
  }, [SKIPPED_KEY]);

  // Track current lead by deal_id (stable across re-fetches)
  const [currentDealId, setCurrentDealId] = useState<string | null>(null);
  const currentIndex = useMemo(() => {
    if (!currentDealId) return 0;
    const idx = queue.findIndex(l => l.deal_id === currentDealId);
    return idx >= 0 ? idx : 0;
  }, [queue, currentDealId]);
  const currentLead = queue[currentIndex] || null;

  // Auto-select first NON-SKIPPED lead when queue loads
  useEffect(() => {
    if (queue.length > 0 && (!currentDealId || !queue.find(l => l.deal_id === currentDealId))) {
      const firstNonSkipped = queue.find(l => !skippedDealIds.has(l.deal_id));
      setCurrentDealId((firstNonSkipped || queue[0]).deal_id);
    }
  }, [queue, currentDealId, skippedDealIds]);

  // Lead context data
  const { data: callHistory = [] } = useCallHistory({
    leadId: currentLead?.lead_id,
    limit: 10,
  });
  const { data: lastMessages = [] } = useLeadLastMessages(currentLead?.lead_id || null);

  // Flow state
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [callAttempts, setCallAttempts] = useState(0);

  // Auto-detect recent call attempts (last 4 hours) when lead changes or callHistory loads
  // If already called 2+ times recently, go straight to "Não atendeu" flow
  const prevLeadIdRef = useRef<string | null>(null);
  const hasAutoDetectedRef = useRef(false);
  useEffect(() => {
    if (!currentLead?.lead_id) return;

    // Reset detection flag when lead changes
    if (currentLead.lead_id !== prevLeadIdRef.current) {
      prevLeadIdRef.current = currentLead.lead_id;
      hasAutoDetectedRef.current = false;
    }

    // Skip if already detected for this lead, or no history yet, or not in idle
    if (hasAutoDetectedRef.current || callHistory.length === 0 || flowState !== 'idle') return;

    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    const recentCalls = callHistory.filter((c: any) =>
      c.started_at && new Date(c.started_at).getTime() > fourHoursAgo &&
      c.team_member_id === teamMember?.id &&
      ['ENDED', 'NOT_ANSWERED', 'REJECTED', 'SILENCED', 'FAILED', 'COMPLETED'].includes(c.status)
    );

    const minAttemptsForNotAnswered = mode === 'closer' ? 1 : 2;

    if (recentCalls.length >= minAttemptsForNotAnswered) {
      // Enough attempts — show "Não atendeu" button directly
      hasAutoDetectedRef.current = true;
      setCallAttempts(recentCalls.length);
      setFlowState('calling_2');
    } else if (recentCalls.length === 1 && mode !== 'closer') {
      // Called once recently (SDR) — set attempts so next call is "2ª tentativa"
      hasAutoDetectedRef.current = true;
      setCallAttempts(1);
    }
  }, [currentLead?.lead_id, callHistory, teamMember?.id, flowState, mode]);

  // Cleanup stale CALLING records on mount — se o cockpit recarregou com um registro
  // "Chamando..." fantasma (chamada que terminou mas DB não atualizou), limpar.
  useEffect(() => {
    if (!teamMember?.id) return;
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    supabase
      .from('call_history')
      .update({ status: 'FAILED', ended_at: new Date().toISOString() })
      .eq('team_member_id', teamMember.id)
      .in('status', ['CALLING', 'RINGING', 'OUTGOING_RING', 'OUTGOING_CALLING'])
      .lt('started_at', twoMinAgo)
      .then(() => {});
  }, [teamMember?.id]);

  // Sync cockpit flow with actual call state from context
  // Safety net for state transitions:
  // 1. Call started externally → sync flowState to calling
  // 2. Call ended while in calling state → stay in calling (show Atendeu/Não atendeu)
  const prevActiveCallRef = useRef<typeof activeCall>(null);
  useEffect(() => {
    const wasActive = !!prevActiveCallRef.current;
    const isActive = !!activeCall;
    prevActiveCallRef.current = activeCall;

    // Call just started but cockpit is still idle — sync it
    if (!wasActive && isActive && flowState === 'idle') {
      setCallAttempts(prev => {
        const newAttempts = prev + 1;
        setFlowState(newAttempts <= 1 ? 'calling_1' : 'calling_2');
        return newAttempts;
      });
      setSessionStats(prev => ({ ...prev, calls: prev.calls + 1 }));
    }

    // Call ended (activeCall went null) while we're in a calling state
    // Stay in calling state so user can mark as Atendeu/Não atendeu
    // (flowState will be 'calling_1'|'calling_2' with !activeCall → shows post-call buttons)
    // This is already handled by the render logic: (calling && !activeCall) shows post-call buttons
  }, [activeCall, flowState]);

  // Not-answered panel state (2 separate messages)
  const [msg1, setMsg1] = useState('');
  const [msg2, setMsg2] = useState('');
  const [editingMsg, setEditingMsg] = useState<1 | 2 | null>(null);
  const [taskName, setTaskName] = useState('');
  const [taskSchedule, setTaskSchedule] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const [generatingAiMsg, setGeneratingAiMsg] = useState(false);

  // Chat input state
  const [chatMessage, setChatMessage] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Context tab (controlled to avoid reset on re-render)
  const [contextTab, setContextTab] = useState('calls');
  // Sidebar tab
  const [sidebarTab, setSidebarTab] = useState<'queue' | 'agenda'>('queue');

  // Auto-scroll chat to bottom when messages change
  useEffect(() => {
    if (contextTab === 'messages' && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [lastMessages, contextTab]);

  // Session stats
  const [sessionStats, setSessionStats] = useState({ calls: 0, answered: 0, notAnswered: 0 });

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.stages?.length) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.minRevenue || filters.maxRevenue) count++;
    if (filters.utmSource && filters.utmSource !== 'all') count++;
    if (filters.sortBy && filters.sortBy !== 'stage_priority') count++;
    return count;
  }, [filters]);

  // UTM options from queue
  const utmOptions = useMemo(() => {
    const sources = new Set<string>();
    queue.forEach(l => { if (l.utm_source) sources.add(l.utm_source); });
    return Array.from(sources).sort();
  }, [queue]);

  const handleCall = useCallback(async () => {
    if (!currentLead?.lead_phone) {
      toast({ title: 'Lead sem telefone', variant: 'destructive' });
      return;
    }
    try {
      // Set flow state BEFORE initiateCall to avoid race conditions
      setCallAttempts(prev => {
        const newAttempts = prev + 1;
        setFlowState(newAttempts <= 1 ? 'calling_1' : 'calling_2');
        return newAttempts;
      });
      setSessionStats(prev => ({ ...prev, calls: prev.calls + 1 }));
      await initiateCall(currentLead.lead_phone, currentLead.lead_id);
    } catch (err: any) {
      // Revert flow state on error
      setFlowState('idle');
      toast({ title: 'Erro ao ligar', description: err.message, variant: 'destructive' });
    }
  }, [currentLead, initiateCall, toast]);

  const handleNotAnswered = useCallback(async () => {
    if (!currentLead) return;
    // Set fallback messages immediately (pass attempts so 2nd attempt gets different msg)
    const [fallbackM1, fallbackM2] = generateNotAnsweredMessages(currentLead.lead_name, callAttempts);
    setMsg1(fallbackM1);
    setMsg2(fallbackM2);
    const task = generateFollowUpTask(currentLead.lead_name, currentLead.lead_id, teamMember?.id || '');
    setTaskName(task.name);
    setTaskSchedule(task.scheduled_at);
    setFlowState('not_answered');
    setSessionStats(prev => ({ ...prev, notAnswered: prev.notAnswered + 1 }));
    setMessageSent(false);
    setTaskCreated(false);
    setEditingMsg(null);

    // Try AI-generated messages (non-blocking — fallback already set)
    setGeneratingAiMsg(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-sales-message', {
        body: {
          lead_id: currentLead.lead_id,
          message_type: 'smart_follow_up',
          custom_context: `SITUAÇÃO: Tentei ligar para ${(currentLead.lead_name || '').split(' ')[0].toLowerCase()} e não atendeu. Esta é a ${callAttempts}ª tentativa de ligação. Preciso enviar 2 mensagens WhatsApp.

OBJETIVO DAS MENSAGENS: gerar CURIOSIDADE e fazer o lead RESPONDER. NÃO vender nada. NÃO explicar o que fazemos. NÃO mencionar produtos, serviços, decoração, consultoria ou qualquer oferta. A venda acontece depois, na ligação.

FORMATO:
- "message": 1ª mensagem — SOMENTE cumprimento curto. Ex: "oi ${(currentLead.lead_name || '').split(' ')[0].toLowerCase()}, tudo bem?"
- "alternative_messages[0]": 2ª mensagem — dizer que tentou ligar + criar curiosidade + propor horário de retorno

${callAttempts >= 2 ? 'IMPORTANTE: Esta é a 2ª tentativa. A mensagem DEVE ser diferente da 1ª vez. Mencionar que tentou DE NOVO. Tom mais direto e objetivo, como quem realmente quer ajudar. NÃO repetir a mesma estrutura da 1ª tentativa.' : ''}

TOM OBRIGATÓRIO (seguir à risca):
- tudo minúsculo, sem letra maiúscula em nenhum lugar
- sem emoji (no máximo 1 discreto tipo 🤙 no final da 2ª msg)
- sem "!" — usar ".." no lugar para pausas
- sem "prezado", "estimado", "gostaríamos" — tom de parceiro, como amigo que manja
- usar "tu/te/ti/contigo" em vez de "você/lhe" quando possível
- mensagens CURTAS (1ª msg = 1 linha, 2ª msg = 2-3 linhas no máximo)
- NUNCA usar "ocupado(a)" ou qualquer construção com parênteses
- NUNCA usar "vi que tu se inscreveu" — nem todo lead se inscreveu em algo

EXEMPLOS DE 2ª MENSAGEM BOA (1ª tentativa):
- "tentei te ligar aqui.. queria trocar uma ideia contigo sobre umas coisas que podem te ajudar bastante.. te ligo amanhã de manhã, fechou?"
- "tentei falar contigo agora.. tenho algo que pode fazer diferença pro teu negócio.. te ligo amanhã às 10h, fechou?"

EXEMPLOS DE 2ª MENSAGEM BOA (2ª tentativa):
- "tentei te ligar de novo aqui.. queria trocar uma ideia contigo, acho que posso te ajudar com umas coisas.. me diz um horário bom pra ti 🤙"
- "te liguei de novo e não consegui falar contigo.. tenho certeza que vai valer a pena a gente conversar.. qual melhor horário pra ti?"

EXEMPLOS DE 2ª MENSAGEM RUIM (NÃO fazer):
- "vi que você está interessado em nossos serviços de decoração" ← ERRADO, menciona produto/serviço
- "vi que tu se inscreveu" ← ERRADO, assume contexto que pode não existir
- "queria saber quando seria bom pra te retornar e conversarmos sobre a sua necessidade" ← ERRADO, formal demais
- "Tentei te ligar algumas vezes esses dias" ← ERRADO, maiúscula no início

HORÁRIO DE RETORNO: ${new Date().getHours() < 12 ? 'sugerir final da tarde de hoje' : new Date().getHours() < 18 ? 'sugerir amanhã de manhã' : 'sugerir amanhã de manhã'}

Se houver histórico de conversa com o lead, use algo da conversa para personalizar a 2ª mensagem (ex: mencionar algo que o lead falou). Caso contrário, manter genérico mas curioso.`,
        },
      });
      if (!error && data) {
        const aiMsg1 = data.message;
        const aiMsg2 = data.alternative_messages?.[0] || fallbackM2;
        if (aiMsg1) setMsg1(aiMsg1);
        if (aiMsg2) setMsg2(aiMsg2);
      }
    } catch {
      // keep fallback messages
    } finally {
      setGeneratingAiMsg(false);
    }
  }, [currentLead, teamMember, callAttempts]);

  const handleSendMessage = useCallback(async () => {
    if (!currentLead?.lead_phone || (!msg1.trim() && !msg2.trim())) return;
    setSendingMessage(true);
    try {
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, api_key, api_url, metadata')
        .contains('teams', ['comercial'])
        .eq('status', 'connected')
        .limit(1)
        .single();
      if (!instance) throw new Error('Instância WhatsApp não encontrada');
      const metadata = (instance.metadata as Record<string, any>) || {};
      const uazapiUrl = instance.api_url || metadata.uazapi_url;
      let phone = currentLead.lead_phone.replace(/\D/g, '');
      if (phone.length <= 11) phone = '55' + phone;

      // Send both messages sequentially (DB insert handled by whatsapp-webhook echo)
      const messages = [msg1, msg2].filter(m => m.trim());
      for (let i = 0; i < messages.length; i++) {
        const response = await fetch(`${uazapiUrl}/send/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instance.api_key },
          body: JSON.stringify({ number: phone, text: messages[i] }),
        });
        if (!response.ok) throw new Error('Falha ao enviar');
        // Small delay between messages so they arrive in order
        if (i < messages.length - 1) {
          await new Promise(r => setTimeout(r, 800));
        }
      }

      setMessageSent(true);
      toast({ title: `${messages.length} mensagens enviadas` });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
    } finally {
      setSendingMessage(false);
    }
  }, [currentLead, msg1, msg2, toast]);

  // Chat: send a single message from the messages tab
  const handleSendChatMessage = useCallback(async () => {
    if (!currentLead?.lead_phone || !chatMessage.trim()) return;
    setSendingChat(true);
    try {
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, api_key, api_url, metadata')
        .contains('teams', ['comercial'])
        .eq('status', 'connected')
        .limit(1)
        .single();
      if (!instance) throw new Error('Instância WhatsApp não encontrada');
      const metadata = (instance.metadata as Record<string, any>) || {};
      const uazapiUrl = instance.api_url || metadata.uazapi_url;
      let phone = currentLead.lead_phone.replace(/\D/g, '');
      if (phone.length <= 11) phone = '55' + phone;

      const text = chatMessage.trim();
      const response = await fetch(`${uazapiUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': instance.api_key },
        body: JSON.stringify({ number: phone, text }),
      });
      if (!response.ok) throw new Error('Falha ao enviar');
      // DB insert handled by whatsapp-webhook echo
      setChatMessage('');
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
    } finally {
      setSendingChat(false);
    }
  }, [currentLead, chatMessage, toast]);

  const handleCreateTask = useCallback(async () => {
    if (!currentLead || !teamMember) return;
    setCreatingTask(true);
    try {
      await createTask.mutateAsync({
        name: taskName,
        task_type: 'call',
        team: 'sales',
        priority: 'high',
        lead_id: currentLead.lead_id,
        responsavel_id: teamMember.id,
        scheduled_at: taskSchedule,
        status: 'scheduled',
      });
      setTaskCreated(true);
      toast({ title: 'Tarefa criada' });
    } catch (err: any) {
      toast({ title: 'Erro ao criar tarefa', description: err.message, variant: 'destructive' });
    } finally {
      setCreatingTask(false);
    }
  }, [currentLead, teamMember, taskName, taskSchedule, createTask, toast]);

  const handleNext = useCallback(() => {
    // Mark current lead as skipped (persists across reloads)
    if (currentLead?.deal_id) {
      skipDeal(currentLead.deal_id);
    }

    // Find next non-skipped lead after current index
    const nextSkipped = new Set(skippedDealIds);
    if (currentLead?.deal_id) nextSkipped.add(currentLead.deal_id);

    let nextLead = null;
    for (let i = currentIndex + 1; i < queue.length; i++) {
      if (!nextSkipped.has(queue[i].deal_id)) { nextLead = queue[i]; break; }
    }
    // If nothing after, wrap around
    if (!nextLead) {
      for (let i = 0; i < currentIndex; i++) {
        if (!nextSkipped.has(queue[i].deal_id)) { nextLead = queue[i]; break; }
      }
    }
    // Fallback: just go to next index
    if (!nextLead) {
      const nextIdx = Math.min(currentIndex + 1, queue.length - 1);
      nextLead = queue[nextIdx];
    }

    setCurrentDealId(nextLead?.deal_id || null);
    setFlowState('idle');
    setCallAttempts(0);
    setMessageSent(false);
    setTaskCreated(false);
    setMsg1('');
    setMsg2('');
    setEditingMsg(null);
  }, [currentIndex, currentLead, queue, skipDeal, skippedDealIds]);

  const handleAnswered = useCallback(() => {
    setSessionStats(prev => ({ ...prev, answered: prev.answered + 1 }));
  }, []);

  const resetAndGoTo = useCallback((dealId: string) => {
    setCurrentDealId(dealId);
    setFlowState('idle');
    setCallAttempts(0); // Will be overridden by auto-detect effect if recent calls exist
    setMessageSent(false);
    setTaskCreated(false);
    setMsg1('');
    setMsg2('');
    setEditingMsg(null);
    prevLeadIdRef.current = null; // Force re-detect of call attempts
    hasAutoDetectedRef.current = false;
  }, []);

  const applySearch = useCallback(() => {
    setFilters(prev => ({ ...prev, search: searchInput || undefined }));
    setCurrentDealId(null); // will auto-select first result
  }, [searchInput]);

  const handleCompleteAgendaTask = useCallback((taskId: string) => {
    completeTask.mutate(taskId, {
      onSuccess: () => {
        toast({ title: 'Tarefa concluída' });
      },
      onError: (err: any) => {
        toast({ title: 'Erro ao concluir', description: err.message, variant: 'destructive' });
      },
    });
  }, [completeTask, toast]);

  const handleOpenLead = useCallback((leadId: string) => {
    window.open(`/comercial/leads/${leadId}`, '_blank');
  }, []);

  const handleAgendaClickLead = useCallback((leadId: string) => {
    const match = queue.find(l => l.lead_id === leadId);
    if (match) {
      resetAndGoTo(match.deal_id);
      setSidebarTab('queue');
    } else {
      // Lead not in queue - open in new tab
      window.open(`/comercial/leads/${leadId}`, '_blank');
    }
  }, [queue, resetAndGoTo]);

  const firstName = currentLead ? (currentLead.lead_name || '').split(' ')[0] : '';

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-zinc-400 text-lg animate-pulse">Carregando fila...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-semibold shrink-0">Cockpit</h1>
          <Select value={mode} onValueChange={(v: CockpitMode) => { setMode(v); setCurrentDealId(null); setFlowState('idle'); setCallAttempts(0); setFilters({}); }}>
            <SelectTrigger className="w-[100px] h-7 bg-zinc-800 border-zinc-700 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sdr">SDR</SelectItem>
              <SelectItem value="closer">Closer</SelectItem>
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="flex items-center gap-1 ml-2">
            <Input
              placeholder="Buscar lead..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applySearch()}
              className="h-7 w-[180px] bg-zinc-800 border-zinc-700 text-xs placeholder:text-zinc-600"
            />
            {searchInput && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-500" onClick={() => { setSearchInput(''); setFilters(prev => ({ ...prev, search: undefined })); setCurrentDealId(null); }}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Filter popover */}
          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={cn('h-7 text-xs gap-1', activeFilterCount > 0 ? 'text-blue-400' : 'text-zinc-400')}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtros {activeFilterCount > 0 && `(${activeFilterCount})`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] bg-zinc-900 border-zinc-700 p-4 space-y-4" align="start">
              {/* Stage filter */}
              <div>
                <p className="text-xs font-medium text-zinc-400 mb-2">Etapas</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableStages.map(stage => {
                    const isActive = !filters.stages?.length || filters.stages.includes(stage);
                    return (
                      <button
                        key={stage}
                        onClick={() => {
                          setFilters(prev => {
                            const current = prev.stages || [];
                            if (!current.length) {
                              return { ...prev, stages: availableStages.filter(s => s !== stage) };
                            }
                            const next = current.includes(stage) ? current.filter(s => s !== stage) : [...current, stage];
                            return { ...prev, stages: next.length === availableStages.length ? undefined : next };
                          });
                          setCurrentDealId(null);
                        }}
                        className={cn(
                          'px-2 py-1 rounded text-xs border transition-colors',
                          isActive ? 'bg-zinc-700 border-zinc-600 text-white' : 'bg-zinc-800/50 border-zinc-800 text-zinc-600'
                        )}
                      >
                        {stage}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sort */}
              <div>
                <p className="text-xs font-medium text-zinc-400 mb-2">Ordenar por</p>
                <Select value={filters.sortBy || 'stage_priority'} onValueChange={v => { setFilters(prev => ({ ...prev, sortBy: v as any })); setCurrentDealId(null); }}>
                  <SelectTrigger className="h-8 bg-zinc-800 border-zinc-700 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stage_priority">Prioridade da etapa</SelectItem>
                    <SelectItem value="recent">Mais recente</SelectItem>
                    <SelectItem value="revenue">Maior faturamento</SelectItem>
                    <SelectItem value="score">Maior score</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date range */}
              <div>
                <p className="text-xs font-medium text-zinc-400 mb-2">Data de criação</p>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={filters.dateFrom || ''}
                    onChange={e => { setFilters(prev => ({ ...prev, dateFrom: e.target.value || undefined })); setCurrentDealId(null); }}
                    className="h-8 bg-zinc-800 border-zinc-700 text-xs flex-1"
                  />
                  <Input
                    type="date"
                    value={filters.dateTo || ''}
                    onChange={e => { setFilters(prev => ({ ...prev, dateTo: e.target.value || undefined })); setCurrentDealId(null); }}
                    className="h-8 bg-zinc-800 border-zinc-700 text-xs flex-1"
                  />
                </div>
              </div>

              {/* Revenue */}
              <div>
                <p className="text-xs font-medium text-zinc-400 mb-2">Faturamento mensal</p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Mín"
                    value={filters.minRevenue || ''}
                    onChange={e => { setFilters(prev => ({ ...prev, minRevenue: e.target.value ? Number(e.target.value) : undefined })); setCurrentDealId(null); }}
                    className="h-8 bg-zinc-800 border-zinc-700 text-xs flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Máx"
                    value={filters.maxRevenue || ''}
                    onChange={e => { setFilters(prev => ({ ...prev, maxRevenue: e.target.value ? Number(e.target.value) : undefined })); setCurrentDealId(null); }}
                    className="h-8 bg-zinc-800 border-zinc-700 text-xs flex-1"
                  />
                </div>
              </div>

              {/* UTM Source */}
              {utmOptions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">Origem (UTM)</p>
                  <Select value={filters.utmSource || 'all'} onValueChange={v => { setFilters(prev => ({ ...prev, utmSource: v === 'all' ? undefined : v })); setCurrentDealId(null); }}>
                    <SelectTrigger className="h-8 bg-zinc-800 border-zinc-700 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {utmOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Clear */}
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="w-full text-xs text-zinc-500" onClick={() => { setFilters({}); setCurrentDealId(null); }}>
                  Limpar filtros
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-zinc-500">{sessionStats.calls}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            <span className="text-green-400">{sessionStats.answered}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <PhoneOff className="h-3.5 w-3.5 text-red-400" />
            <span className="text-red-400">{sessionStats.notAnswered}</span>
          </div>
          <span className="text-zinc-600">{currentIndex + 1}/{queue.length}</span>
        </div>
      </div>

      {/* Active filter pills */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-zinc-800/50 bg-zinc-900/30">
          {filters.stages?.length ? (
            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 gap-1">
              Etapas: {filters.stages.join(', ')}
              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => { setFilters(prev => ({ ...prev, stages: undefined })); setCurrentDealId(null); }} />
            </Badge>
          ) : null}
          {(filters.dateFrom || filters.dateTo) && (
            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 gap-1">
              Data: {filters.dateFrom || '...'} → {filters.dateTo || '...'}
              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => { setFilters(prev => ({ ...prev, dateFrom: undefined, dateTo: undefined })); setCurrentDealId(null); }} />
            </Badge>
          )}
          {filters.sortBy && filters.sortBy !== 'stage_priority' && (
            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 gap-1">
              Ordem: {filters.sortBy === 'recent' ? 'Recente' : filters.sortBy === 'revenue' ? 'Faturamento' : 'Score'}
              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => { setFilters(prev => ({ ...prev, sortBy: undefined })); setCurrentDealId(null); }} />
            </Badge>
          )}
        </div>
      )}

      {/* Main content */}
      {!currentLead ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-zinc-500">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">Nenhum lead na fila</p>
            <p className="text-sm mt-1">Ajuste os filtros ou mude o modo SDR/Closer</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Left: Lead info + context */}
          <div className="w-[380px] border-r border-zinc-800 flex flex-col min-h-0">
            {/* Lead header */}
            <div className="p-4 border-b border-zinc-800 space-y-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <Badge variant="outline" className="mb-1.5 text-[10px] border-zinc-600 text-zinc-400">
                    {currentLead.stage_name}
                  </Badge>
                  <h2 className="text-xl font-bold truncate">{currentLead.lead_name}</h2>
                  {currentLead.company_name && (
                    <p className="text-zinc-500 flex items-center gap-1 text-sm">
                      <Building2 className="h-3 w-3" />
                      {currentLead.company_name}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-zinc-500 h-7 shrink-0" onClick={() => window.open(`/comercial/leads/${currentLead.lead_id}`, '_blank')}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Quick info row */}
              <div className="flex items-center gap-2 flex-wrap">
                {currentLead.lead_phone && (
                  <span className="text-xs font-mono text-zinc-400">{currentLead.lead_phone}</span>
                )}
                {currentLead.sales_score != null && (
                  <Badge className={cn(
                    'text-[10px]',
                    currentLead.sales_score >= 70 ? 'bg-green-500/20 text-green-400 hover:bg-green-500/20' :
                    currentLead.sales_score >= 40 ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20' :
                    'bg-red-500/20 text-red-400 hover:bg-red-500/20'
                  )}>
                    Score {currentLead.sales_score}
                  </Badge>
                )}
                {currentLead.monthly_revenue && (
                  <Badge className="text-[10px] bg-blue-500/20 text-blue-400 hover:bg-blue-500/20">
                    {currentLead.monthly_revenue}
                  </Badge>
                )}
              </div>

              {(currentLead.utm_source || currentLead.utm_campaign) && (
                <p className="text-[11px] text-zinc-600">
                  <Zap className="h-3 w-3 inline mr-0.5" />
                  {currentLead.utm_source}{currentLead.utm_campaign ? ` / ${currentLead.utm_campaign}` : ''}
                </p>
              )}

              {currentLead.last_interaction_at && (
                <p className="text-[11px] text-zinc-600">
                  Último contato: {formatDistanceToNow(new Date(currentLead.last_interaction_at), { addSuffix: true, locale: ptBR })}
                </p>
              )}
            </div>

            {/* Context tabs */}
            <Tabs value={contextTab} onValueChange={setContextTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="bg-zinc-900 border-b border-zinc-800 rounded-none h-8 w-full justify-start px-2 shrink-0">
                <TabsTrigger value="calls" className="text-xs h-7 data-[state=active]:bg-zinc-800">
                  <Phone className="h-3 w-3 mr-1" /> Chamadas ({callHistory.length})
                </TabsTrigger>
                <TabsTrigger value="messages" className="text-xs h-7 data-[state=active]:bg-zinc-800">
                  <MessageCircle className="h-3 w-3 mr-1" /> Mensagens ({lastMessages.length})
                </TabsTrigger>
                <TabsTrigger value="info" className="text-xs h-7 data-[state=active]:bg-zinc-800">
                  Info
                </TabsTrigger>
              </TabsList>

              {/* Call history */}
              <TabsContent value="calls" className="flex-1 m-0 overflow-y-auto">
                <div className="p-2 space-y-1">
                  {callHistory.length === 0 ? (
                    <p className="text-xs text-zinc-600 text-center py-6">Nenhuma chamada registrada</p>
                  ) : (
                    callHistory.map((call: any) => {
                      const isCalling = ['CALLING', 'RINGING', 'OUTGOING_RING', 'OUTGOING_CALLING', 'CONNECTING'].includes(call.status);
                      const isClickable = isCalling || call.status === 'ACTIVE';
                      return (
                      <div
                        key={call.id}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg text-xs",
                          isClickable ? "hover:bg-zinc-700/50 cursor-pointer" : "hover:bg-zinc-800/50",
                          isCalling && "bg-green-500/5 border border-green-500/20"
                        )}
                        onClick={isClickable ? () => {
                          if (activeCall) {
                            // Chamada ativa no contexto — reabrir modal
                            setShowActiveCallModal(true);
                          } else {
                            // Registro fantasma — limpar
                            supabase
                              .from('call_history')
                              .update({ status: 'FAILED', ended_at: new Date().toISOString() })
                              .eq('id', call.id)
                              .then(() => {
                                toast({ title: 'Chamada fantasma limpa' });
                              });
                          }
                        } : undefined}
                      >
                        {call.direction === 'INCOMING' ? (
                          <PhoneIncoming className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        ) : (
                          <PhoneOutgoing className={cn("h-3.5 w-3.5 shrink-0", isCalling ? "text-green-400 animate-pulse" : "text-green-400")} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              'font-medium',
                              call.status === 'COMPLETED' || call.status === 'ENDED' || call.status === 'ACTIVE' ? 'text-zinc-300' :
                              call.status === 'MISSED' || call.status === 'NO_ANSWER' || call.status === 'NOT_ANSWERED' ? 'text-red-400' :
                              isCalling ? 'text-green-400' : 'text-zinc-400'
                            )}>
                              {call.status === 'COMPLETED' || call.status === 'ENDED' ? 'Atendida' :
                               call.status === 'ACTIVE' ? 'Em andamento' :
                               call.status === 'MISSED' || call.status === 'NO_ANSWER' || call.status === 'NOT_ANSWERED' ? 'Não atendeu' :
                               isCalling ? (activeCall ? '📞 Chamando... (clique)' : '⚠️ Chamando... (limpar)') :
                               call.status === 'REJECTED' ? 'Rejeitada' :
                               call.status === 'SILENCED' ? 'Silenciada' :
                               call.status === 'FAILED' ? 'Falhou' :
                               call.status}
                            </span>
                            <span className="text-zinc-600">
                              {call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}` : '-'}
                            </span>
                          </div>
                          <p className="text-zinc-600 truncate">
                            {call.started_at ? format(new Date(call.started_at), "dd/MM HH:mm", { locale: ptBR }) : '-'}
                            {call.team_member?.name ? ` - ${call.team_member.name}` : ''}
                          </p>
                          {call.ai_summary && (
                            <p className="text-zinc-500 mt-0.5 line-clamp-2">{call.ai_summary}</p>
                          )}
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>
              </TabsContent>

              {/* Chat-style messages */}
              <TabsContent value="messages" className="flex-1 m-0 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5" ref={chatContainerRef}>
                  {lastMessages.length === 0 ? (
                    <p className="text-xs text-zinc-600 text-center py-6">Nenhuma mensagem</p>
                  ) : (
                    <>
                      {lastMessages.map((msg: any, idx: number) => {
                        const prevMsg = lastMessages[idx - 1];
                        const showDate = !prevMsg || (msg.sent_at && prevMsg.sent_at &&
                          format(new Date(msg.sent_at), 'dd/MM') !== format(new Date(prevMsg.sent_at), 'dd/MM'));
                        return (
                          <React.Fragment key={msg.id}>
                            {showDate && msg.sent_at && (
                              <div className="text-center py-1">
                                <span className="text-[9px] text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded-full">
                                  {format(new Date(msg.sent_at), "dd/MM/yyyy")}
                                </span>
                              </div>
                            )}
                            <div className={cn('flex', msg.is_from_me ? 'justify-end' : 'justify-start')}>
                              <div className={cn(
                                'px-2.5 py-1.5 rounded-lg text-xs max-w-[85%]',
                                msg.is_from_me
                                  ? 'bg-green-900/40 border border-green-800/30 rounded-br-sm'
                                  : 'bg-zinc-800 border border-zinc-700/50 rounded-bl-sm'
                              )}>
                                <p className="text-zinc-200 whitespace-pre-wrap break-words">{msg.content || `[${msg.message_type || 'mídia'}]`}</p>
                                <p className={cn('text-[9px] mt-0.5 text-right', msg.is_from_me ? 'text-green-600' : 'text-zinc-600')}>
                                  {msg.sent_at ? format(new Date(msg.sent_at), "HH:mm") : ''}
                                </p>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}
                </div>
                {/* Chat input */}
                {currentLead?.lead_phone && (
                  <div className="border-t border-zinc-800 p-1.5 flex gap-1.5 shrink-0">
                    <Input
                      value={chatMessage}
                      onChange={e => setChatMessage(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChatMessage(); } }}
                      placeholder="Mensagem..."
                      className="h-8 text-xs bg-zinc-900 border-zinc-700"
                      disabled={sendingChat}
                    />
                    <Button size="icon" className="h-8 w-8 bg-green-600 hover:bg-green-700 shrink-0" onClick={handleSendChatMessage} disabled={sendingChat || !chatMessage.trim()}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Info tab */}
              <TabsContent value="info" className="flex-1 m-0 overflow-y-auto">
                <div className="p-3 space-y-3">
                  {/* BANT */}
                  {(currentLead.bant_budget || currentLead.bant_need) && (
                    <div>
                      <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">BANT</p>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        {currentLead.bant_budget && <div className="text-zinc-400"><span className="text-zinc-600">B:</span> {currentLead.bant_budget}</div>}
                        {currentLead.bant_authority && <div className="text-zinc-400"><span className="text-zinc-600">A:</span> {currentLead.bant_authority}</div>}
                        {currentLead.bant_need && <div className="text-zinc-400"><span className="text-zinc-600">N:</span> {currentLead.bant_need}</div>}
                        {currentLead.bant_timeline && <div className="text-zinc-400"><span className="text-zinc-600">T:</span> {currentLead.bant_timeline}</div>}
                      </div>
                    </div>
                  )}

                  {/* AI Insights */}
                  {currentLead.ai_conversation_insights && (
                    <div>
                      <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Insights IA</p>
                      <p className="text-xs text-zinc-400 leading-relaxed">{currentLead.ai_conversation_insights}</p>
                    </div>
                  )}

                  {/* Deal */}
                  <div>
                    <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Deal</p>
                    <div className="text-xs text-zinc-400 space-y-0.5">
                      <p>{currentLead.deal_title}</p>
                      {currentLead.deal_value && <p>R$ {currentLead.deal_value.toLocaleString('pt-BR')}</p>}
                      {currentLead.sales_rep_name && <p>Rep: {currentLead.sales_rep_name}</p>}
                      <p className="text-zinc-600">Criado: {format(new Date(currentLead.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Center: Action area */}
          <div className="flex-1 flex flex-col items-center justify-center p-8 min-w-0">
            {flowState === 'idle' && (() => {
              // Detectar chamada ativa no contexto global (iniciada de outra tela)
              if (activeCall) {
                return (
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto animate-pulse">
                      <Phone className="h-8 w-8 text-green-400" />
                    </div>
                    <p className="text-zinc-400">Chamada em andamento com <span className="text-white font-medium">{activeCall.peerName || activeCall.peerPhone}</span></p>
                    <Button size="lg" className="h-12 px-8 bg-green-600 hover:bg-green-700 rounded-xl" onClick={() => setShowActiveCallModal(true)}>
                      <Phone className="h-5 w-5 mr-2" /> Abrir controles
                    </Button>
                  </div>
                );
              }

              // Detectar chamada fantasma (DB mostra CALLING mas contexto limpo)
              const staleCalling = callHistory.find((c: any) =>
                ['CALLING', 'RINGING', 'OUTGOING_RING', 'OUTGOING_CALLING', 'CONNECTING', 'ACTIVE'].includes(c.status)
              );
              if (staleCalling) {
                return (
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto">
                      <AlertTriangle className="h-8 w-8 text-yellow-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-zinc-300 font-medium">Chamada anterior não finalizou corretamente</p>
                      <p className="text-xs text-zinc-500">Status: {staleCalling.status} — {staleCalling.started_at ? format(new Date(staleCalling.started_at), "dd/MM HH:mm", { locale: ptBR }) : ''}</p>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-12 px-6 border-zinc-600 hover:bg-zinc-800 rounded-xl"
                        onClick={async () => {
                          await supabase
                            .from('call_history')
                            .update({ status: 'FAILED', ended_at: new Date().toISOString() })
                            .eq('id', staleCalling.id);
                          toast({ title: 'Chamada fantasma limpa' });
                        }}
                      >
                        <X className="h-4 w-4 mr-2" /> Limpar e continuar
                      </Button>
                      <Button
                        size="lg"
                        className="h-12 px-6 bg-green-600 hover:bg-green-700 rounded-xl"
                        onClick={handleCall}
                        disabled={!currentLead?.lead_phone}
                      >
                        <Phone className="h-4 w-4 mr-2" /> Ligar novamente
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
              <div className="text-center space-y-6">
                <div className="space-y-2">
                  <p className="text-zinc-400 text-sm">Pronto para ligar para</p>
                  <p className="text-3xl font-bold">{firstName}</p>
                  {callHistory.length > 0 && (
                    <p className="text-xs text-zinc-600">
                      {callHistory.length} chamada{callHistory.length > 1 ? 's' : ''} anteriore{callHistory.length > 1 ? 's' : ''}
                      {callHistory[0]?.started_at && ` - última ${formatDistanceToNow(new Date(callHistory[0].started_at), { addSuffix: true, locale: ptBR })}`}
                    </p>
                  )}
                </div>
                <Button
                  size="lg"
                  className="h-16 px-12 text-lg bg-green-600 hover:bg-green-700 rounded-2xl"
                  onClick={handleCall}
                  disabled={!currentLead.lead_phone || !!activeCall}
                >
                  <Phone className="h-6 w-6 mr-3" />
                  Ligar
                </Button>
                <div className="flex gap-3">
                  <Button variant="ghost" size="sm" onClick={handleNext} className="text-zinc-500 hover:text-zinc-300">
                    Pular lead
                  </Button>
                </div>
              </div>
              );
            })()}

            {(flowState === 'calling_1' || flowState === 'calling_2') && !activeCall && (
              <div className="text-center space-y-6">
                <div className="space-y-2">
                  <p className="text-zinc-400 text-sm">
                    {callAttempts >= 2
                      ? `${callAttempts} tentativas recentes`
                      : callAttempts === 1
                        ? '1ª tentativa finalizada'
                        : 'Tentativa finalizada'}
                  </p>
                  <p className="text-2xl font-semibold">{firstName}</p>
                </div>
                <div className="flex gap-4">
                  {callAttempts < (mode === 'closer' ? 1 : 2) ? (
                    <>
                      <Button size="lg" className="h-14 px-8 bg-green-600 hover:bg-green-700 rounded-xl" onClick={() => { handleAnswered(); handleNext(); }}>
                        <CheckCircle2 className="h-5 w-5 mr-2" /> Atendeu
                      </Button>
                      <Button size="lg" variant="outline" className="h-14 px-8 border-zinc-600 hover:bg-zinc-800 rounded-xl" onClick={handleCall} disabled={!!activeCall}>
                        <Phone className="h-5 w-5 mr-2" /> Ligar de novo
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="lg" variant="outline" className="h-14 px-8 border-red-600/50 text-red-400 hover:bg-red-500/10 rounded-xl" onClick={handleNotAnswered}>
                        <PhoneOff className="h-5 w-5 mr-2" /> Não atendeu
                      </Button>
                      <Button size="lg" variant="outline" className="h-14 px-8 border-zinc-600 hover:bg-zinc-800 rounded-xl" onClick={handleCall} disabled={!!activeCall}>
                        <Phone className="h-5 w-5 mr-2" /> Tentar de novo
                      </Button>
                      <Button size="lg" className="h-14 px-8 bg-green-600 hover:bg-green-700 rounded-xl" onClick={() => { handleAnswered(); handleNext(); }}>
                        <CheckCircle2 className="h-5 w-5 mr-2" /> Atendeu
                      </Button>
                    </>
                  )}
                </div>
                {callAttempts === 1 && mode !== 'closer' && <p className="text-xs text-zinc-600">Ligue uma 2ª vez antes de marcar como não atendeu</p>}
              </div>
            )}

            {(flowState === 'calling_1' || flowState === 'calling_2') && activeCall && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto animate-pulse">
                  <Phone className="h-8 w-8 text-green-400" />
                </div>
                <p className="text-zinc-400">Ligação em andamento com <span className="text-white font-medium">{firstName}</span></p>
                <p className="text-xs text-zinc-600">{callAttempts === 1 ? '1ª' : '2ª'} tentativa</p>
              </div>
            )}

            {/* NOT ANSWERED PANEL */}
            {flowState === 'not_answered' && (
              <div className="w-full max-w-xl space-y-4">
                <div className="text-center mb-4">
                  <PhoneOff className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <p className="text-lg font-medium">{firstName} não atendeu</p>
                  <p className="text-sm text-zinc-500">{mode === 'closer' ? 'Crie a tarefa de follow-up' : 'Aprove a mensagem e tarefa abaixo'}</p>
                </div>

                {/* WhatsApp messages (2 bubbles) — SDR only */}
                {mode !== 'closer' && (
                <Card className="bg-zinc-900 border-zinc-800 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-green-400" />
                    <span className="text-sm font-medium">Mensagens WhatsApp</span>
                    {generatingAiMsg ? (
                      <span className="text-[10px] text-purple-400 flex items-center gap-1"><Sparkles className="h-3 w-3 animate-pulse" /> IA gerando...</span>
                    ) : (
                      <span className="text-[10px] text-zinc-600">2 mensagens</span>
                    )}
                  </div>

                  {/* Message 1 */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-600">1ª mensagem</span>
                      {!messageSent && (
                        <button onClick={() => setEditingMsg(editingMsg === 1 ? null : 1)} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                          {editingMsg === 1 ? 'ok' : 'editar'}
                        </button>
                      )}
                    </div>
                    {editingMsg === 1 ? (
                      <Textarea value={msg1} onChange={e => setMsg1(e.target.value)} className="bg-zinc-800 border-zinc-700 text-sm min-h-[40px] resize-none" autoFocus />
                    ) : (
                      <div className="bg-green-500/10 rounded-lg rounded-tr-none p-2.5 text-sm text-zinc-300 ml-auto max-w-[85%]">{msg1}</div>
                    )}
                  </div>

                  {/* Message 2 */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-600">2ª mensagem</span>
                      {!messageSent && (
                        <button onClick={() => setEditingMsg(editingMsg === 2 ? null : 2)} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                          {editingMsg === 2 ? 'ok' : 'editar'}
                        </button>
                      )}
                    </div>
                    {editingMsg === 2 ? (
                      <Textarea value={msg2} onChange={e => setMsg2(e.target.value)} className="bg-zinc-800 border-zinc-700 text-sm min-h-[60px] resize-none" autoFocus />
                    ) : (
                      <div className="bg-green-500/10 rounded-lg rounded-tr-none p-2.5 text-sm text-zinc-300 ml-auto max-w-[85%]">{msg2}</div>
                    )}
                  </div>

                  {!messageSent ? (
                    <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleSendMessage} disabled={sendingMessage || (!msg1.trim() && !msg2.trim())}>
                      {sendingMessage ? <span className="animate-pulse">Enviando 2 mensagens...</span> : <><Send className="h-4 w-4 mr-2" /> Enviar 2 mensagens</>}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 text-green-400 text-sm"><CheckCircle2 className="h-4 w-4" /> 2 mensagens enviadas</div>
                  )}
                </Card>
                )}

                {/* Follow-up task */}
                <Card className="bg-zinc-900 border-zinc-800 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-400" />
                    <span className="text-sm font-medium">Tarefa de follow-up</span>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3 space-y-2">
                    <p className="text-sm text-zinc-300">{taskName}</p>
                    <p className="text-xs text-zinc-500">Agendada: {taskSchedule ? format(new Date(taskSchedule), "dd/MM 'às' HH:mm", { locale: ptBR }) : '-'}</p>
                  </div>
                  {!taskCreated ? (
                    <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleCreateTask} disabled={creatingTask}>
                      {creatingTask ? <span className="animate-pulse">Criando...</span> : <><Plus className="h-4 w-4 mr-2" /> Criar tarefa</>}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 text-blue-400 text-sm"><CheckCircle2 className="h-4 w-4" /> Tarefa criada</div>
                  )}
                </Card>

                <Button size="lg" className="w-full h-12 bg-zinc-700 hover:bg-zinc-600 rounded-xl" onClick={handleNext}>
                  Próximo lead <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </div>
            )}
          </div>

          {/* Right: Queue + Agenda sidebar */}
          <div className="w-[240px] border-l border-zinc-800 flex flex-col min-h-0">
            {/* Sidebar tabs */}
            <div className="flex border-b border-zinc-800 shrink-0">
              <button
                onClick={() => setSidebarTab('queue')}
                className={cn(
                  'flex-1 px-2 py-2 text-[10px] font-medium uppercase tracking-wider transition-colors',
                  sidebarTab === 'queue' ? 'text-white border-b-2 border-green-500 bg-zinc-800/50' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Fila ({queue.length})
              </button>
              <button
                onClick={() => setSidebarTab('agenda')}
                className={cn(
                  'flex-1 px-2 py-2 text-[10px] font-medium uppercase tracking-wider transition-colors relative',
                  sidebarTab === 'agenda' ? 'text-white border-b-2 border-blue-500 bg-zinc-800/50' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Agenda
                {(agenda?.overdue?.filter((t: any) => t.task_type !== 'call' || !!t.meeting_link)?.length || 0) > 0 && (
                  <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-red-500" />
                )}
              </button>
            </div>

            {/* Queue tab */}
            {sidebarTab === 'queue' && (
              <>
              {/* Quick stage filter pills */}
              <div className="px-2 py-1.5 border-b border-zinc-800 flex flex-wrap gap-1 shrink-0">
                {availableStages.map(stage => {
                  const isActive = !filters.stages?.length || filters.stages.includes(stage);
                  const isSingleFilter = filters.stages?.length === 1 && filters.stages[0] === stage;
                  return (
                    <button
                      key={stage}
                      onClick={() => {
                        setFilters(prev => {
                          if (isSingleFilter) return { ...prev, stages: undefined };
                          return { ...prev, stages: [stage] };
                        });
                        setCurrentDealId(null);
                      }}
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors',
                        isSingleFilter ? 'bg-green-600 text-white' :
                        !filters.stages?.length ? 'bg-zinc-800 text-zinc-500 hover:text-zinc-300' :
                        isActive ? 'bg-zinc-800 text-zinc-500 hover:text-zinc-300' :
                        'bg-zinc-900 text-zinc-700 hover:text-zinc-500'
                      )}
                    >
                      {stage}
                    </button>
                  );
                })}
              </div>
              <ScrollArea className="flex-1">
                <div className="divide-y divide-zinc-800/50">
                  {queue.map((lead, idx) => {
                    const isSkipped = skippedDealIds.has(lead.deal_id);
                    return (
                    <button
                      key={lead.deal_id}
                      onClick={() => resetAndGoTo(lead.deal_id)}
                      className={cn(
                        'w-full text-left px-2.5 py-2 hover:bg-zinc-800/50 transition-colors',
                        idx === currentIndex && 'bg-zinc-800 border-l-2 border-green-500',
                        isSkipped && idx !== currentIndex && 'opacity-50'
                      )}
                    >
                      <p className={cn('text-xs font-medium truncate', idx === currentIndex ? 'text-white' : 'text-zinc-400')}>
                        {lead.lead_name} {isSkipped && <span className="text-zinc-600">·</span>}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-zinc-700 text-zinc-500 leading-tight">
                          {lead.stage_name}
                        </Badge>
                        {lead.monthly_revenue && (
                          <span className="text-[9px] text-zinc-600 truncate">{lead.monthly_revenue}</span>
                        )}
                      </div>
                      {lead.last_interaction_at && (
                        <p className="text-[9px] text-zinc-700 mt-0.5">
                          {formatDistanceToNow(new Date(lead.last_interaction_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      )}
                    </button>
                    );
                  })}
                </div>
              </ScrollArea>
              </>
            )}

            {/* Agenda tab - call tasks only show if they have a meeting_link (Google Meet) */}
            {sidebarTab === 'agenda' && (() => {
              const keepTask = (t: any) => t.task_type !== 'call' || !!t.meeting_link;
              const agendaOverdue = (agenda?.overdue || []).filter(keepTask);
              const agendaToday = (agenda?.today || []).filter(keepTask);
              return (
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-3">
                    {/* Overdue */}
                    {agendaOverdue.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 px-1 mb-1.5">
                          <AlertTriangle className="h-3 w-3 text-red-400" />
                          <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">Atrasadas ({agendaOverdue.length})</span>
                        </div>
                        <div className="space-y-0.5">
                          {agendaOverdue.map((task: any) => (
                            <AgendaItem key={task.id} task={task} isOverdue
                              onClickLead={handleAgendaClickLead}
                              onComplete={handleCompleteAgendaTask}
                              onOpenLead={handleOpenLead}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Today */}
                    <div>
                      <div className="flex items-center gap-1.5 px-1 mb-1.5">
                        <CalendarDays className="h-3 w-3 text-blue-400" />
                        <span className="text-[10px] font-medium text-blue-400 uppercase tracking-wider">
                          Hoje ({agendaToday.length})
                        </span>
                      </div>
                      {agendaToday.length === 0 ? (
                        <p className="text-[10px] text-zinc-600 text-center py-4">Nenhum compromisso hoje</p>
                      ) : (
                        <div className="space-y-0.5">
                          {agendaToday.map((task: any) => (
                            <AgendaItem key={task.id} task={task}
                              onClickLead={handleAgendaClickLead}
                              onComplete={handleCompleteAgendaTask}
                              onOpenLead={handleOpenLead}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SalesCallCockpit() {
  return (
    <div className="h-screen flex flex-col">
      <CallExecutionContent />
    </div>
  );
}
