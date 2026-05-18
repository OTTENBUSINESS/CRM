import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles, X, Send, Loader2, ChevronDown, ChevronUp,
  MessageSquare, Target, AlertTriangle, TrendingUp,
  Calendar, User, Zap, Plus, History, StopCircle, Save,
  Maximize2, Minimize2, Brain, Shield, FileText, Clipboard,
  Briefcase, DollarSign, Users, RefreshCw, Search, Bot,
  Lightbulb, Rocket, Phone, CheckCircle2, ListFilter, Trophy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/lib/supabase';
import { usePlaybookContent } from '@/hooks/useSalesPlaybook';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  actionButtons?: ActionButton[];
}

interface ActionButton {
  label: string;
  action: string;
  data?: any;
}

interface SalesAIChatProps {
  leadId?: string;
  leadName?: string;
  leadPhone?: string;
  leadEmail?: string;
  leadContext?: {
    salesScore?: number;
    salesStage?: string;
    bant?: {
      budget: boolean | null;
      authority: boolean | null;
      need: boolean | null;
      timeline: boolean | null;
    };
    lastInteraction?: string;
    utm_source?: string;
    utm_campaign?: string;
  };
  agentSlug?: string;
  templates?: typeof SALES_SUPERPOWER_TEMPLATES;
  chatTitle?: string;
}

// Super-powered Sales Templates
const SALES_SUPERPOWER_TEMPLATES = [
  {
    id: 'top-leads',
    name: 'Top Leads para Abordar',
    icon: Trophy,
    color: 'bg-amber-500',
    prompt: `Use a ferramenta search_leads_ranked para listar os TOP 10 leads mais qualificados.

Depois, para cada lead retornado:
1. Busque as últimas mensagens WhatsApp
2. Verifique se tem deals abertos
3. Monte uma lista com: Nome, Score, Estágio, Último contato, Por que abordar agora

Ordene por relevância para contato IMEDIATO.`,
  },
  {
    id: 'hot-leads-action',
    name: 'Leads Quentes + Criar Deals',
    icon: Rocket,
    color: 'bg-orange-500',
    prompt: `Use bulk_analyze_leads com criteria='hot_leads' para encontrar leads quentes.

Para cada lead encontrado:
1. Mostre nome, score, telefone
2. Analise se já tem deal aberto
3. Se NÃO tiver deal, sugira criar um com create_deal

Ao final, pergunte se devo criar os deals para os leads que ainda não têm.`,
  },
  {
    id: 'stale-deals',
    name: 'Deals Esfriando',
    icon: AlertTriangle,
    color: 'bg-red-500',
    prompt: `Use bulk_analyze_leads com criteria='stale_deals' para encontrar deals que estão esfriando (sem atividade há mais de 7 dias).

Para cada deal encontrado:
1. Mostre lead, valor, dias parado
2. Sugira uma ação de follow-up
3. Ofereça criar uma atividade de follow-up com create_activity

ALERTA: Esses deals precisam de atenção URGENTE!`,
  },
  {
    id: 'daily-briefing',
    name: 'Briefing do Dia',
    icon: Calendar,
    color: 'bg-purple-500',
    prompt: `Faça meu briefing completo do dia:

1. Use get_pipeline_summary para métricas gerais
2. Use bulk_analyze_leads com 'hot_leads' para oportunidades quentes
3. Use bulk_analyze_leads com 'need_followup' para follow-ups pendentes
4. Use bulk_analyze_leads com 'stale_deals' para deals em risco

Monte um resumo executivo com:
- 🔥 Prioridade máxima (3 leads para ligar AGORA)
- 📞 Follow-ups do dia
- ⚠️ Deals que precisam de atenção
- 💰 Resumo financeiro do pipeline`,
  },
  {
    id: 'analyze-pipeline',
    name: 'Analisar Pipeline',
    icon: TrendingUp,
    color: 'bg-indigo-500',
    prompt: `Use get_pipeline_summary para obter métricas do pipeline.

Depois analise:
1. **Distribuição por Status**: Open vs Won vs Lost
2. **Valor Total em Aberto**: Potencial de receita
3. **Taxa de Conversão**: Won / (Won + Lost)
4. **Ticket Médio**: Valor médio dos deals
5. **Gargalos**: Onde estão mais deals parados

Dê insights acionáveis para melhorar a conversão!`,
  },
  {
    id: 'create-deals-batch',
    name: 'Criar Deals em Lote',
    icon: Briefcase,
    color: 'bg-blue-500',
    prompt: `Quero criar oportunidades para leads qualificados que ainda não têm deal.

1. Use bulk_analyze_leads com 'high_potential' para encontrar leads com BANT quase completo
2. Para cada um, busque os produtos disponíveis
3. Sugira qual produto e valor para cada lead
4. Pergunte confirmação antes de criar os deals

Só crie deals para leads realmente qualificados (score >= 60 ou BANT >= 3/4).`,
  },
  {
    id: 'objection-bank',
    name: 'Banco de Objeções',
    icon: Shield,
    color: 'bg-red-500',
    prompt: `Analise as objeções mais comuns nos meus leads.

Use query_supabase para buscar conversas WhatsApp dos últimos 30 dias.

Depois:
1. Categorize: Preço, Timing, Confiança, Concorrência, etc
2. Para cada objeção comum, sugira um script de contorno
3. Formate como um "manual de objeções" pronto para usar`,
  },
];

// Specific lead templates (when inside a lead page)
const LEAD_SPECIFIC_TEMPLATES = [
  {
    id: 'pre-contact',
    name: 'Preparar Contato',
    icon: Phone,
    color: 'bg-cyan-500',
    prompt: `Prepare-me para contatar este lead AGORA.

Busque via query_supabase:
1. Dados completos do lead
2. Últimas 20 mensagens WhatsApp
3. Deals existentes
4. Atividades recentes

Depois monte o briefing:
- **Quem é**: Resumo do perfil
- **Última conversa**: O que foi falado
- **Interesse**: O que chamou atenção
- **Gancho de abertura**: Como começar
- **Objetivo**: O que conquistar
- **Objeções prováveis**: E como contornar`,
  },
  {
    id: 'create-deal-lead',
    name: 'Criar Deal',
    icon: Briefcase,
    color: 'bg-blue-500',
    prompt: `Quero criar um deal para este lead.

1. Busque os produtos disponíveis
2. Analise as conversas para entender o interesse
3. Sugira o produto e valor mais adequado
4. Calcule uma probabilidade de fechamento

Depois pergunte se devo criar o deal com create_deal.
Se sim, crie e confirme.`,
  },
  {
    id: 'update-score',
    name: 'Atualizar Score',
    icon: RefreshCw,
    color: 'bg-green-500',
    prompt: `Recalcule o score deste lead considerando TODOS os dados.

Busque e analise:
1. Conversas WhatsApp (quantidade, recência, sentimento)
2. Atividades realizadas
3. Checkouts/Transações
4. BANT atual
5. Deals existentes

Calcule um score de 0 a 100 com justificativa.
Depois use update_lead para atualizar o score no banco.`,
  },
  {
    id: 'generate-message',
    name: 'Gerar Mensagem',
    icon: MessageSquare,
    color: 'bg-emerald-500',
    prompt: `Gere 3 opções de mensagem WhatsApp para este lead.

Primeiro busque as últimas conversas para contexto.

Depois crie:
1. **Casual e amigável**: Tom leve
2. **Urgência/Escassez**: Criar senso de urgência
3. **Valor educativo**: Agregar valor antes de vender

Cada mensagem: máximo 3 parágrafos + CTA claro.
Formate para copiar e colar direto no WhatsApp.`,
  },
  {
    id: 'suggest-proposal',
    name: 'Sugerir Proposta',
    icon: DollarSign,
    color: 'bg-purple-500',
    prompt: `Sugira a melhor proposta comercial para este lead.

Busque e analise:
1. Produtos disponíveis com preços
2. Conversas para entender necessidades
3. Histórico de transações (se houver)

Monte a proposta:
- **Produto ideal**: Com justificativa
- **Preço sugerido**: Desconto se apropriado
- **Pagamento**: PIX, cartão, parcelado
- **Bônus**: O que oferecer
- **Script**: Mensagem pronta para enviar`,
  },
  {
    id: 'create-followup',
    name: 'Criar Follow-up',
    icon: Calendar,
    color: 'bg-orange-500',
    prompt: `Crie uma atividade de follow-up para este lead.

Analise a última interação para decidir:
1. Tipo: call, meeting, follow_up, email
2. Título adequado
3. Quando agendar (sugira data/hora)
4. Prioridade

Depois use create_activity para criar a atividade.`,
  },
];

// Normaliza markdown mal formatado (modelo retorna espaços em vez de \n)
function normalizeMarkdown(text: string): string {
  // 1) Quebra linhas longas em "blocos" onde deveria ter \n\n
  //    Detecta: texto + 2 espaços + heading/tabela/hr
  let result = text
    // heading colado no texto anterior
    .replace(/([^\n])  +(#{1,6} )/g, '$1\n\n$2')
    // tabela colada (| xxx |) quando anterior não é pipe
    .replace(/([^\n|])  +(\|[^|\n]+\|)/g, '$1\n\n$2')
    // --- colado
    .replace(/([^\n])  +(---+)/g, '$1\n\n$2');

  // 2) Garante \n\n antes de heading mesmo sem espaço duplo
  result = result.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');

  // 3) Garante \n\n antes de tabela (| ... | seguido de |---| na próxima linha)
  result = result.replace(/([^\n|])\n(\|[^\n]+\|\n\|[-:| ]+\|)/g, '$1\n\n$2');

  return result;
}

export function SalesAIChat({
  leadId,
  leadName,
  leadPhone,
  leadEmail,
  leadContext,
  agentSlug = 'sales-copilot',
  templates: templatesProp,
  chatTitle,
}: SalesAIChatProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: playbookContent } = usePlaybookContent();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingStatus, setStreamingStatus] = useState('');
  const [showTemplates, setShowTemplates] = useState(true);

  // Sessões e histórico
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  // Check if we're in lead context or global context
  const isLeadContext = !!leadId;
  const templates = templatesProp
    ? templatesProp
    : isLeadContext
      ? [...LEAD_SPECIFIC_TEMPLATES, ...SALES_SUPERPOWER_TEMPLATES]
      : SALES_SUPERPOWER_TEMPLATES;

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isStreaming) scrollToBottom();
  }, [isStreaming, streamingText, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Cancel streaming
  const cancelStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setStreamingText('');
    setStreamingStatus('');
    inFlightRef.current = false;
  }, []);

  // ===== SESSÕES E HISTÓRICO =====

  // Config ID para Sales Copilot (se não existir, será criado)
  const SALES_COPILOT_CONFIG_ID = 'sales-copilot-config';

  // Carregar sessões quando o chat abre
  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen, leadId]);

  // Carregar sessões anteriores (e auto-carregar a última se não tem sessão ativa)
  const loadSessions = async () => {
    const agentLabel = chatTitle || (agentSlug === 'sales-copilot' ? 'Sales Copilot' : agentSlug);
    const titleFilter = isLeadContext
      ? `${agentLabel} - ${leadName || leadId}`
      : `${agentLabel} - Global`;

    const { data } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at, summary')
      .ilike('title', `%${titleFilter}%`)
      .order('created_at', { ascending: false })
      .limit(10);

    setSessions(data || []);

    // Auto-carregar última sessão se não tem sessão ativa e tem histórico
    if (!sessionId && data && data.length > 0) {
      loadSession(data[0].id);
    }
  };

  // Criar nova sessão
  const createSession = async () => {
    // Primeiro, verificar se existe um config para o agentSlug
    let configId = null;
    const { data: existingConfig } = await supabase
      .from('chat_configs')
      .select('id')
      .eq('slug', agentSlug)
      .maybeSingle();

    if (existingConfig) {
      configId = existingConfig.id;
    } else {
      // Usar o config 'sales' como fallback (Gerente de Vendas)
      const { data: fallbackConfig } = await supabase
        .from('chat_configs')
        .select('id')
        .eq('slug', 'sales')
        .maybeSingle();
      configId = fallbackConfig?.id;
    }

    const agentLabel = chatTitle || (agentSlug === 'sales-copilot' ? 'Sales Copilot' : agentSlug);
    const sessionTitle = isLeadContext
      ? `${agentLabel} - ${leadName || 'Lead'}`
      : `${agentLabel} - Global`;

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        config_id: configId,
        title: sessionTitle,
        summary: isLeadContext ? `Conversa sobre ${leadName}` : 'Análise geral',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create session');
      return null;
    }

    if (data) {
      setSessionId(data.id);
      setMessages([]);
      setShowTemplates(true);
      setShowHistory(false);
      loadSessions();
    }
    return data?.id;
  };

  // Carregar mensagens de uma sessão
  const loadSession = async (id: string) => {
    setSessionId(id);
    setShowHistory(false);

    const { data } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.created_at),
      })));
      setShowTemplates(false);
    }
  };

  // Salvar mensagem no banco
  const saveMessage = async (role: 'user' | 'assistant', content: string, currentSessionId: string) => {
    await supabase
      .from('chat_messages')
      .insert({
        session_id: currentSessionId,
        role,
        content,
      });
  };

  // Build system context for the AI
  const buildSystemContext = () => {
    let context = `SALES COPILOT - ASSISTENTE DE VENDAS COM SUPERPODERES

Você é um copiloto de vendas inteligente com acesso TOTAL ao banco de dados e AÇÕES diretas.
Você pode buscar, analisar, criar e atualizar registros usando ferramentas especializadas.

====== FERRAMENTAS DISPONÍVEIS ======

📊 CONSULTA (use query_supabase para SELECTs):
- leads: id, name, email, phone, sales_score, sales_stage, bant_*, utm_*, created_at
- deals: id, lead_id, product_id, negotiated_price, status, pipeline_stage_id, ai_win_probability
- products: id, name, price, description, active
- whatsapp_messages: id, lead_id, content, is_from_me, created_at
- company_activities: id, lead_id, type, title, description, scheduled_at, completed
- transactions: id, lead_id, amount, status, product_name
- checkouts: id, lead_id, product_name, status, abandoned_at
- sales_pipeline_stages: id, name, order (estágios do pipeline)

🎯 AÇÕES DE VENDAS (ferramentas especializadas):
- create_deal: Criar oportunidade/deal para um lead
- update_deal: Atualizar deal (mover estágio, preço, status won/lost)
- update_lead: Atualizar lead (score, estágio, BANT, tags, notas)
- search_leads_ranked: Buscar leads ranqueados por critérios
- get_pipeline_summary: Resumo do pipeline (métricas, valor por estágio)
- create_activity: Criar atividade/tarefa para um lead (follow-up, call, meeting)
- bulk_analyze_leads: Analisar leads em lote (hot_leads, stale_deals, need_followup, high_potential)

====== INSTRUÇÕES ======
1. SEMPRE use as ferramentas para buscar dados REAIS - nunca invente!
2. Para criar/atualizar, use as ferramentas de ação (create_deal, update_lead, etc.)
3. Seja ESPECÍFICO - cite nomes, valores, datas, scores reais
4. Responda em português do Brasil com markdown formatado
5. Quando pedirem análise, use bulk_analyze_leads com critério apropriado
6. Ao criar deals, sugira valores baseados em dados reais

====== EXEMPLOS DE USO ======
- "top 10 leads": use search_leads_ranked { limit: 10, order_by: 'score_desc' }
- "criar deal para João": use create_deal { lead_id: '...', negotiated_price: X }
- "leads que precisam follow-up": use bulk_analyze_leads { criteria: 'need_followup' }
- "mover deal para negociação": use update_deal { deal_id: '...', pipeline_stage_id: '...' }
- "resumo do pipeline": use get_pipeline_summary {}

`;

    if (isLeadContext && leadId) {
      context += `
CONTEXTO DO LEAD ATUAL:
- lead_id: '${leadId}'
- Nome: ${leadName || 'Não informado'}
- Telefone: ${leadPhone || 'Não informado'}
- Email: ${leadEmail || 'Não informado'}
- Sales Score: ${leadContext?.salesScore || 'Não calculado'}
- Estágio: ${leadContext?.salesStage || 'captura'}
- BANT: Budget=${leadContext?.bant?.budget ?? '?'}, Authority=${leadContext?.bant?.authority ?? '?'}, Need=${leadContext?.bant?.need ?? '?'}, Timeline=${leadContext?.bant?.timeline ?? '?'}
- Origem: ${leadContext?.utm_source || 'Não informado'} / ${leadContext?.utm_campaign || ''}

Para buscar dados deste lead:
- SELECT * FROM leads WHERE id = '${leadId}'
- SELECT * FROM whatsapp_messages WHERE lead_id = '${leadId}' ORDER BY created_at DESC LIMIT 30
- SELECT * FROM lead_timeline WHERE lead_id = '${leadId}' ORDER BY created_at DESC
- SELECT * FROM deals WHERE lead_id = '${leadId}'
`;
    } else {
      context += `
CONTEXTO GLOBAL:
Você está no modo global - pode acessar TODOS os leads, deals e dados do sistema.
Use para análises de pipeline, busca de leads, relatórios, etc.
`;
    }

    if (playbookContent) {
      context += `
PLAYBOOK DE VENDAS:
${playbookContent}
`;
    }

    return context;
  };

  // Send message to AI
  const sendMessage = async (content: string) => {
    if (!content.trim() || isStreaming) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Criar sessão se não existir
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = await createSession();
      if (!currentSessionId) {
        inFlightRef.current = false;
        return;
      }
    }

    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setShowTemplates(false);

    // Salvar mensagem do usuário no banco
    await saveMessage('user', content, currentSessionId);

    setIsStreaming(true);
    setStreamingText('');
    setStreamingStatus('analisando dados...');

    // Construir histórico para enviar ao backend
    const conversationHistory = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Contexto do lead (se aplicável)
    const leadContextData = isLeadContext ? {
      lead_id: leadId,
      lead_name: leadName,
      lead_phone: leadPhone,
      lead_email: leadEmail,
      sales_score: leadContext?.salesScore,
      sales_stage: leadContext?.salesStage,
      bant: leadContext?.bant,
      utm_source: leadContext?.utm_source,
      utm_campaign: leadContext?.utm_campaign,
    } : undefined;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-manager?stream=1`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: content,
            agent: agentSlug,
            session_id: currentSessionId,
            conversation_history: conversationHistory,
            context: leadContextData,
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const ev of events) {
          const line = ev.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data);

            if ((chunk.type === 'response.text.delta' || chunk.type === 'response.output_text.delta') && chunk.delta) {
              fullText += chunk.delta;
              setStreamingText(fullText);
              setStreamingStatus('');
            } else if ((chunk.type === 'response.text.done' || chunk.type === 'response.output_text.done') && chunk.text) {
              fullText = chunk.text;
              setStreamingText(fullText);
            } else if (chunk.type === 'status') {
              setStreamingStatus(chunk.message || '');
            } else if (chunk.type === 'stream.start') {
              setStreamingStatus('buscando dados...');
            }
          } catch (parseErr) {
            // skip unparseable chunk
          }
        }
      }

      // Save final message
      if (fullText && fullText.trim()) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: fullText,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Salvar resposta do assistente no banco
        if (currentSessionId) {
          await saveMessage('assistant', fullText, currentSessionId);
        }

        // Invalidate queries if score or deal related
        if (content.toLowerCase().includes('score') || content.toLowerCase().includes('recalcul')) {
          queryClient.invalidateQueries({ queryKey: ['sales-lead', leadId] });
          queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
        }
        if (content.toLowerCase().includes('deal') || content.toLowerCase().includes('oportunidade')) {
          queryClient.invalidateQueries({ queryKey: ['contact-deals', leadId] });
          queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        // Request was cancelled by user
      } else {
        // Fallback non-streaming
        try {
          const { data: result, error: invokeError } = await supabase.functions.invoke('chat-manager', {
            body: {
              message: content,
              agent: agentSlug,
              session_id: sessionId,
              conversation_history: conversationHistory,
              context: leadContextData,
            },
          });
          if (invokeError) throw invokeError;
          const assistantMessage: Message = {
            role: 'assistant',
            content: result.reply || 'Erro ao processar. Tente novamente.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, assistantMessage]);
        } catch {
          const errorMsg: Message = {
            role: 'assistant',
            content: 'Erro de conexão. Verifique sua internet e tente novamente.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      }
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      setStreamingStatus('');
      inFlightRef.current = false;
      abortControllerRef.current = null;
    }
  };

  const handleTemplateClick = (template: typeof templates[0]) => {
    sendMessage(template.prompt);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    createSession();
  };

  // Salvar resposta da IA nos insights do lead
  const saveToInsights = async (content: string) => {
    if (!leadId) {
      toast({
        title: "Erro",
        description: "Não é possível salvar sem um lead selecionado",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('save-lead-insights', {
        body: {
          lead_id: leadId,
          content,
          source: 'sales-copilot',
        },
      });

      if (invokeError) throw invokeError;

      toast({
        title: "Salvo nos Insights! ✅",
        description: `Análise salva para ${result.lead?.name || 'lead'}`,
      });

      // Invalidar queries para atualizar a UI
      queryClient.invalidateQueries({ queryKey: ['sales-lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-insights', leadId] });
    } catch (error: any) {
      console.error('Failed to save insights');
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar a análise",
        variant: "destructive",
      });
    }
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50",
          "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700",
          "animate-pulse hover:animate-none"
        )}
        title={chatTitle || "Assistente de Vendas IA"}
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card
      className={cn(
        "fixed shadow-2xl z-50 transition-all duration-300 flex flex-col border-2 border-blue-200",
        isExpanded
          ? "bottom-4 right-4 left-4 top-4 w-auto md:bottom-6 md:right-6 md:left-auto md:top-auto md:w-[750px] md:h-[85vh]"
          : "bottom-6 right-6 w-[450px] h-[650px]",
        isMinimized && "h-14"
      )}
    >
      {/* Header */}
      <CardHeader className="p-3 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle className="text-sm font-medium truncate max-w-[200px]">
              {isLeadContext ? `IA: ${leadName}` : (chatTitle || 'Assistente de Vendas')}
            </CardTitle>
            <Badge className="bg-white/20 text-white text-xs">
              Superpoderes
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={clearChat}
              title="Nova conversa"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={() => setShowHistory(!showHistory)}
              title="Histórico de conversas"
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={() => {
                if (!isExpanded && isMinimized) setIsMinimized(false);
                setIsExpanded(!isExpanded);
              }}
              title={isExpanded ? "Reduzir" : "Expandir"}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {!isMinimized && (
        <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
          {/* History Panel */}
          {showHistory && (
            <div className="p-3 border-b bg-muted/50 max-h-[200px] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">Conversas anteriores</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => createSession()}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nova
                </Button>
              </div>
              {sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Nenhuma conversa anterior
                </p>
              ) : (
                <div className="space-y-1">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => loadSession(session.id)}
                      className={cn(
                        "w-full text-left p-2 rounded-md text-xs hover:bg-muted transition-colors",
                        sessionId === session.id && "bg-blue-100 border-blue-300"
                      )}
                    >
                      <div className="font-medium truncate">
                        {new Date(session.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      {session.summary && (
                        <div className="text-muted-foreground truncate">
                          {session.summary}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages Area */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 && showTemplates && !showHistory ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <Bot className="h-12 w-12 mx-auto text-blue-500 mb-2" />
                  <h3 className="font-semibold text-lg">{chatTitle || 'Assistente de Vendas com Superpoderes'}</h3>
                  <p className="text-sm text-muted-foreground">
                    {isLeadContext
                      ? `Posso ajudar com ${leadName}. Escolha uma ação ou pergunte!`
                      : (chatTitle ? 'Escolha um template ou pergunte qualquer coisa!' : 'Posso buscar leads, analisar pipeline, criar deals e muito mais!')}
                  </p>
                </div>

                {/* Template Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {templates.map((template) => {
                    const Icon = template.icon;
                    return (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateClick(template)}
                        className="p-3 rounded-lg border hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                      >
                        <div
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center mb-2 text-white",
                            template.color
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-medium group-hover:text-blue-600">
                          {template.name}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Actions */}
                {isLeadContext && (
                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Ações Rápidas</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-blue-100"
                        onClick={() => sendMessage(`Qual o melhor horário para contatar ${leadName}?`)}
                      >
                        Melhor horário
                      </Badge>
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-blue-100"
                        onClick={() => sendMessage(`Quais as objeções que ${leadName} já levantou?`)}
                      >
                        Ver objeções
                      </Badge>
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-blue-100"
                        onClick={() => sendMessage(`Crie um deal para ${leadName} com o produto mais adequado`)}
                      >
                        Criar deal
                      </Badge>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <p className="text-xs text-muted-foreground text-center">
                    Ou digite sua pergunta abaixo — tenho acesso a TODOS os dados!
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[90%] rounded-lg",
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white p-3'
                          : 'bg-muted p-4'
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <>
                          <div className="text-sm max-w-none [&_p]:mb-3 [&_ul]:my-3 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:my-3 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_strong]:font-semibold [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_hr]:my-3 [&_hr]:border-border">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                table: ({ children }) => (
                                  <div className="overflow-x-auto -mx-2 my-3 rounded border border-border">
                                    <table className="w-full text-[11px] border-collapse">
                                      {children}
                                    </table>
                                  </div>
                                ),
                                thead: ({ children }) => (
                                  <thead className="bg-muted/80">{children}</thead>
                                ),
                                th: ({ children }) => (
                                  <th className="px-2 py-1.5 text-left text-[11px] font-semibold border-b border-border whitespace-nowrap">
                                    {children}
                                  </th>
                                ),
                                td: ({ children }) => (
                                  <td className="px-2 py-1 text-[11px] border-b border-border/50 whitespace-nowrap">
                                    {children}
                                  </td>
                                ),
                                tr: ({ children, ...props }) => (
                                  <tr className="even:bg-muted/20 hover:bg-muted/40" {...props}>
                                    {children}
                                  </tr>
                                ),
                              }}
                            >
                              {normalizeMarkdown(msg.content)}
                            </ReactMarkdown>
                          </div>
                          {/* Botão Salvar nos Insights - apenas para contexto de lead */}
                          {isLeadContext && (
                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                                onClick={() => {
                                  saveToInsights(msg.content);
                                }}
                              >
                                <Save className="h-3 w-3" />
                                Salvar nos Insights
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.content);
                                  toast({ title: "Copiado!", description: "Texto copiado para a área de transferência" });
                                }}
                              >
                                <Clipboard className="h-3 w-3" />
                                Copiar
                              </Button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                      <span className="text-[10px] opacity-60 mt-1 block">
                        {msg.timestamp.toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Streaming */}
                {isStreaming && streamingText && (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] rounded-lg p-4 bg-muted">
                      <div className="text-sm prose prose-sm max-w-none dark:prose-invert [&_p]:mb-3 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1 [&_strong]:font-semibold">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => (
                              <div className="overflow-x-auto -mx-2 my-2">
                                <table className="w-full text-xs border-collapse min-w-[400px]">
                                  {children}
                                </table>
                              </div>
                            ),
                            th: ({ children }) => (
                              <th className="bg-muted/80 px-2 py-1.5 text-left text-[11px] font-semibold border border-border whitespace-nowrap">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="px-2 py-1 text-[11px] border border-border whitespace-nowrap">
                                {children}
                              </td>
                            ),
                            tr: ({ children, ...props }) => (
                              <tr className="even:bg-muted/30" {...props}>
                                {children}
                              </tr>
                            ),
                          }}
                        >
                          {normalizeMarkdown(streamingText)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {isStreaming && !streamingText && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span
                            className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                            style={{ animationDelay: '0ms' }}
                          />
                          <span
                            className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                            style={{ animationDelay: '150ms' }}
                          />
                          <span
                            className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                            style={{ animationDelay: '300ms' }}
                          />
                        </div>
                        {streamingStatus && (
                          <span className="text-xs text-muted-foreground italic">
                            {streamingStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="p-3 border-t bg-muted/30">
            {messages.length > 0 && !isStreaming && (
              <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
                {templates.slice(0, 4).map((template) => (
                  <Badge
                    key={template.id}
                    variant="outline"
                    className="cursor-pointer hover:bg-blue-100 whitespace-nowrap text-xs"
                    onClick={() => handleTemplateClick(template)}
                  >
                    {template.name}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={isStreaming ? 'Aguarde...' : 'Pergunte qualquer coisa sobre vendas...'}
                disabled={isStreaming}
                className="flex-1 min-h-[40px] max-h-[100px] resize-none"
                rows={1}
              />
              {isStreaming ? (
                <Button onClick={cancelStreaming} variant="destructive" className="self-end">
                  <StopCircle className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim()}
                  className="bg-blue-600 hover:bg-blue-700 self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
