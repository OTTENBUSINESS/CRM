import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";
import { isAuthorizedCaller, unauthorizedResponse } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SUPABASE_URL/SERVICE_ROLE_KEY sao injetadas automaticamente pela plataforma.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// API keys de LLM sao carregadas da tabela `config` (admin preenche em
// /configuracoes > API Keys) via getIntegrationKey(). Hidratadas no handler.
let OPENAI_API_KEY = "";
let ANTHROPIC_API_KEY = "";

// ==================== HELPERS ====================

/**
 * Remove lone surrogates from strings that break JSON serialization.
 * Error: "no low surrogate in string" from Anthropic API.
 */
function sanitizeForJSON(obj: any): any {
  if (typeof obj === 'string') {
    // Remove lone surrogates (high without low, or low without high)
    // deno-lint-ignore no-control-regex
    return obj.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForJSON);
  }
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = sanitizeForJSON(obj[key]);
    }
    return result;
  }
  return obj;
}

// ==================== SAFETY: STRIP INTERNAL THINKING ====================

/**
 * Remove "pensamento interno" da IA antes de enviar ao lead.
 * LLMs (especialmente Claude) às vezes prefixam a resposta com raciocínio:
 *   "Analisando o histórico, a call já foi agendada... Vou perguntar.\n\nmensagem real"
 * Isso NUNCA deve ir pro WhatsApp.
 *
 * Patterns detectados:
 * - Frases começando com "Analisando", "Vou", "Preciso", "Pensando", "Considerando", "Avaliando"
 *   seguidas de uma quebra de linha dupla e a mensagem real
 * - Texto entre colchetes [pensamento interno]
 * - Prefixos "Resposta:" ou "Mensagem:"
 */
function stripInternalThinking(message: string): string {
  if (!message) return message;

  let cleaned = message;

  // SAFETY NET: Bloquear COMPLETAMENTE mensagens que contêm termos internos
  // Esses termos NUNCA apareceriam em uma mensagem legítima para o lead
  const INTERNAL_KEYWORDS = [
    'o lead ', 'do lead ', 'ao lead ', 'pro lead',
    'desqualificação', 'desqualificar', 'qualificação do',
    'fluxo de ', 'faturamento abaixo', 'abaixo do mínimo',
    'INTERNAL', 'NÃO FALE ISSO',
    'preciso aplicar', 'preciso seguir o',
    'vou aplicar o fluxo', 'vou seguir o fluxo',
    'regra de negócio', 'pipeline_stage',
    'tool_call', 'function_call',
    'qualify_lead', 'check_availability',
    'sales_rep', 'lead_id',
  ];
  const lowerMsg = cleaned.toLowerCase();
  const hasInternalKeyword = INTERNAL_KEYWORDS.some(kw => lowerMsg.includes(kw));
  if (hasInternalKeyword) {
    console.error(`🚫 BLOCKED internal message (keyword match): "${cleaned.substring(0, 150)}..."`);
    return ''; // Retorna vazio — mensagem NÃO será enviada
  }

  // Pattern 1: Blocos de raciocínio antes de \n\n (frase que começa com verbo de pensamento)
  const thinkingPrefixPattern = /^(Analisand[oa]|Vou |Preciso |Pensand[oa]|Considerand[oa]|Avaliand[oa]|Observand[oa]|Verificand[oa]|Notei que|Percebi que|Olhando|Com base|Baseado|Entendi que|O lead )[^\n]*(\n[^\n]*)*?\n\n/i;
  const thinkingMatch = cleaned.match(thinkingPrefixPattern);
  if (thinkingMatch) {
    const afterThinking = cleaned.substring(thinkingMatch[0].length).trim();
    if (afterThinking.length > 10) {
      console.warn(`⚠️ STRIPPED internal thinking: "${thinkingMatch[0].substring(0, 100)}..."`);
      cleaned = afterThinking;
    }
  }

  // Pattern 2: Texto entre colchetes no início [pensamento]
  cleaned = cleaned.replace(/^\[(?!ai_media|MEDIA)[^\]]{10,}\]\s*\n*/g, '').trim();

  // Pattern 3: Prefixos "Resposta:", "Mensagem:" no início
  cleaned = cleaned.replace(/^(Resposta|Mensagem|Texto|Reply|Message)\s*:\s*/i, '').trim();

  return cleaned;
}

// ==================== PROVIDER DETECTION ====================

function isAnthropicModel(model: string): boolean {
  return model.startsWith('claude');
}

/**
 * Helper para chamadas simples (sem tools) - suporta OpenAI e Anthropic
 */
async function callLLMSimple(
  model: string,
  systemPrompt: string,
  userMessages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number = 500,
): Promise<string> {
  // Fallback se model vier vazio
  if (!model) {
    console.warn('⚠️ Model vazio, usando fallback claude-sonnet-4-6');
    model = 'claude-sonnet-4-6';
  }
  if (isAnthropicModel(model)) {
    // Garantir alternância de mensagens (requisito Anthropic)
    const anthropicMsgs: { role: string; content: string }[] = [];
    for (const m of userMessages) {
      const last = anthropicMsgs[anthropicMsgs.length - 1];
      if (last && last.role === m.role) {
        last.content += '\n' + m.content;
      } else {
        anthropicMsgs.push({ ...m });
      }
    }
    // Anthropic exige pelo menos 1 mensagem e a primeira deve ser "user"
    if (anthropicMsgs.length === 0) {
      anthropicMsgs.push({ role: "user", content: "Gere a mensagem conforme as instruções acima." });
    } else if (anthropicMsgs[0].role !== "user") {
      anthropicMsgs.unshift({ role: "user", content: "Contexto da conversa anterior:" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(sanitizeForJSON({
        model,
        system: systemPrompt,
        messages: anthropicMsgs,
        temperature,
        max_tokens: maxTokens,
      })),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json();
    return data.content?.find((b: any) => b.type === 'text')?.text || "";
  }

  // OpenAI
  const messages = [
    { role: "system", content: systemPrompt },
    ...userMessages,
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ==================== INTERFACES ====================

interface AgentSettings {
  // Horario
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];

  // Comportamento
  debounce_seconds: number;
  response_delay_min_ms: number;
  response_delay_max_ms: number;
  typing_speed_cpm: number;

  // Quebra de mensagens
  message_split_max_length: number;
  delay_between_messages_min_ms: number;
  delay_between_messages_max_ms: number;

  // Contexto
  context_messages_limit: number;
  context_deals_limit: number;
  context_products_limit: number;
  context_tasks_limit: number;
  context_notes_limit: number;
  conversation_history_limit: number;

  // Conversa
  max_messages_per_conversation: number;
  auto_pause_after_human_reply: boolean;
  human_cooldown_minutes: number;

  // Processamento
  lock_duration_seconds: number;
  max_retry_attempts: number;
  queue_batch_size: number;

  // Mensagens
  fallback_message: string;

  // Cadência
  cadence_silence_timeout_minutes: number;

  // Agenda
  meeting_duration_minutes: number;

  // Rate limiting
  cadence_max_messages_per_hour: number;
  cadence_max_messages_per_day: number;
  cadence_batch_size: number;
  cadence_delay_between_leads_ms: number;

  // Anti-ban: limites separados por tipo de contato
  max_new_contacts_per_day: number;       // Contato frio (nunca falou conosco) — MAIS arriscado
  max_followups_unreplied_per_day: number; // Follow-up para quem não respondeu — arriscado
  // Respostas a leads que iniciaram contato = sem limite (risco zero)
}

// Defaults para garantir que sempre temos valores
const DEFAULT_SETTINGS: AgentSettings = {
  working_hours_start: '00:00',
  working_hours_end: '23:59',
  working_days: [0, 1, 2, 3, 4, 5, 6],
  debounce_seconds: 30,
  response_delay_min_ms: 2000,
  response_delay_max_ms: 5000,
  typing_speed_cpm: 300,
  message_split_max_length: 200,
  delay_between_messages_min_ms: 500,
  delay_between_messages_max_ms: 1500,
  context_messages_limit: 20,
  context_deals_limit: 5,
  context_products_limit: 10,
  context_tasks_limit: 5,
  context_notes_limit: 5,
  conversation_history_limit: 20,
  max_messages_per_conversation: 50,
  auto_pause_after_human_reply: true,
  human_cooldown_minutes: 10,
  lock_duration_seconds: 30,
  max_retry_attempts: 3,
  queue_batch_size: 10,
  fallback_message: 'Desculpe, nao entendi. Pode repetir?',
  cadence_silence_timeout_minutes: 120,
  meeting_duration_minutes: 45,

  // Rate limiting
  cadence_max_messages_per_hour: 20,
  cadence_max_messages_per_day: 40,
  cadence_batch_size: 5,
  cadence_delay_between_leads_ms: 8000,

  // Anti-ban: limites por tipo de contato
  max_new_contacts_per_day: 20,        // Contato frio: max 20/dia (WhatsApp não-oficial)
  max_followups_unreplied_per_day: 25, // Follow-up silent: max 25/dia
};

interface AgentConfig {
  id: string;
  name: string;
  system_prompt: string;
  personality_traits: string[];
  target_stages: string[];
  settings: AgentSettings;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
}

interface AgentTool {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  action_type: string;
  action_config: Record<string, any>;
}

interface ConversationState {
  id: string;
  lead_id: string;
  agent_id: string;
  status: string;
  messages_history: any[];
  total_messages_sent: number;
  total_messages_received: number;
  paused_by: string | null;
  last_processed_at: string | null;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  sales_stage?: string;
  pipeline_stage_id?: string;
  pipeline_stage_name?: string;
  sales_score?: number;
  bant_budget?: boolean;
  bant_authority?: boolean;
  bant_need?: boolean;
  bant_timeline?: boolean;
  context?: string;
  company_name?: string;
  job_title?: string;
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  tags?: string[];
  instagram?: string;
  instagram_profile_id?: string;
}

interface WhatsAppInstance {
  id: string;
  name: string;
  api_key: string;
  api_url: string;
  metadata?: Record<string, any>;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Merge settings com defaults para garantir que todos os campos existem
 */
function mergeSettings(settings: Partial<AgentSettings> | null): AgentSettings {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

/**
 * Verifica se está dentro do horário de trabalho (timezone America/Sao_Paulo)
 */
function isWithinWorkingHours(settings: AgentSettings): boolean {
  const now = new Date();
  // Converter para horário de São Paulo (UTC-3)
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayOfWeek = brTime.getDay();

  if (!settings.working_days.includes(dayOfWeek)) {
    return false;
  }

  const currentTime = `${String(brTime.getHours()).padStart(2, '0')}:${String(brTime.getMinutes()).padStart(2, '0')}`;
  return currentTime >= settings.working_hours_start && currentTime <= settings.working_hours_end;
}

/**
 * Calcula o próximo horário comercial (para reagendar mensagens fora do expediente)
 * Retorna ISO string em UTC
 */
function getNextWorkingTime(settings: AgentSettings): string {
  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

  // Tentar hoje se ainda não passou do horário de início
  const currentTime = `${String(brTime.getHours()).padStart(2, '0')}:${String(brTime.getMinutes()).padStart(2, '0')}`;

  // Iterar até 7 dias pra encontrar o próximo dia útil
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(brTime);
    candidate.setDate(candidate.getDate() + dayOffset);
    const dayOfWeek = candidate.getDay();

    if (!settings.working_days.includes(dayOfWeek)) continue;

    // Se é hoje e já passou do horário de fim, pula pro próximo dia
    if (dayOffset === 0 && currentTime > settings.working_hours_end) continue;

    // Definir o horário de início (ou agora se ainda está dentro do expediente hoje)
    const [startH, startM] = settings.working_hours_start.split(':').map(Number);

    if (dayOffset === 0 && currentTime >= settings.working_hours_start) {
      // Ainda dentro do expediente — retornar agora (não deveria chegar aqui, mas safety)
      return now.toISOString();
    }

    // Setar pra horário de início do dia candidato + pequeno random (0-15min pra parecer natural)
    candidate.setHours(startH, startM + Math.floor(Math.random() * 15), 0, 0);

    // Converter de volta pra UTC (BRT = UTC-3, adicionar 3h)
    const utcTime = new Date(candidate.getTime() + 3 * 60 * 60 * 1000);
    return utcTime.toISOString();
  }

  // Fallback: 8h de amanhã
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setUTCHours(11, 0, 0, 0); // 08:00 BRT = 11:00 UTC
  return tomorrow.toISOString();
}

/**
 * Calcula delay humanizado para resposta
 */
function calculateResponseDelay(settings: AgentSettings, messageLength: number): number {
  const baseDelay = settings.response_delay_min_ms +
    Math.random() * (settings.response_delay_max_ms - settings.response_delay_min_ms);

  // Adiciona tempo de "digitação" baseado no tamanho da resposta
  const typingTime = (messageLength / settings.typing_speed_cpm) * 60 * 1000;

  return Math.round(baseDelay + typingTime * 0.3);
}

/**
 * Quebra mensagem longa em partes menores e naturais
 */
function splitMessageNaturally(text: string, maxLength: number): string[] {
  const messages: string[] = [];

  // Primeiro, divide por parágrafos
  const paragraphs = text.split('\n\n').filter(p => p.trim());

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLength) {
      messages.push(paragraph.trim());
    } else {
      // Divide por sentenças
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      let currentMessage = '';

      for (const sentence of sentences) {
        if ((currentMessage + sentence).length <= maxLength) {
          currentMessage += sentence;
        } else {
          if (currentMessage.trim()) {
            messages.push(currentMessage.trim());
          }
          currentMessage = sentence;
        }
      }

      if (currentMessage.trim()) {
        messages.push(currentMessage.trim());
      }
    }
  }

  return messages;
}

/**
 * Enriquece o lead com o nome do estágio do pipeline
 */
async function enrichLeadWithStageName(supabase: any, lead: Lead): Promise<Lead> {
  if (lead.pipeline_stage_id) {
    const { data } = await supabase
      .from('sales_pipeline_stages')
      .select('name')
      .eq('id', lead.pipeline_stage_id)
      .single();
    if (data?.name) {
      lead.pipeline_stage_name = data.name;
    }
  }
  return lead;
}

/**
 * Verifica se o lead já é cliente (tem org ativa ou deal ganho).
 * Usado como guard para evitar prospecção automática de clientes.
 */
async function isLeadAlreadyClient(supabase: any, leadId: string): Promise<boolean> {
  // Check 1: Lead é primary_contact de alguma organization ativa
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('primary_contact_id', leadId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (org) return true;

  // Check 2: Lead tem algum deal com status 'won'
  const { data: wonDeal } = await supabase
    .from('deals')
    .select('id')
    .eq('lead_id', leadId)
    .eq('status', 'won')
    .limit(1)
    .maybeSingle();

  return !!wonDeal;
}

// ==================== BOT DETECTION ====================

/**
 * Verifica se o número está na lista de bloqueados.
 */
async function isPhoneBlocked(supabase: any, phone: string): Promise<boolean> {
  const normalizedPhone = phone.replace(/\D/g, '');
  const { data } = await supabase
    .from('blocked_phones')
    .select('id')
    .eq('phone', normalizedPhone)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Detecta se a conversa é com um bot automático (chatbot externo).
 *
 * Critérios (deve atingir score >= 3 para ser considerado bot):
 *
 * 1. REPETIÇÃO: Mesma mensagem enviada 3+ vezes pelo número              (+2)
 * 2. PADRÃO BOT: Mensagens com padrões típicos de chatbot                (+2)
 *    - "Ao continuar nessa conversa, você concorda"
 *    - "nos informe o e-mail que você mais utiliza"
 *    - "parece que você informou um e-mail inválido"
 *    - "Estamos te transferindo para"
 *    - Links institucionais (politica-de-privacidade, suporte)
 * 3. VELOCIDADE: Respostas em <3s consistentemente (4+ vezes)             (+2)
 * 4. LOOP: Agente já tentou marcar como perdido 2+ vezes                  (+3)
 * 5. VOLUME: Mais de 30 mensagens trocadas em <1h com o mesmo número      (+2)
 */
async function detectBotConversation(
  supabase: any,
  leadId: string,
  phone: string,
): Promise<{ isBot: boolean; score: number; reasons: string[] }> {
  const reasons: string[] = [];
  let score = 0;

  // Buscar últimas 50 mensagens do lead (últimas 2h)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: recentMsgs } = await supabase
    .from('whatsapp_messages')
    .select('content, is_from_me, sent_at, message_type')
    .eq('lead_id', leadId)
    .is('group_id', null)
    .gte('sent_at', twoHoursAgo)
    .order('sent_at', { ascending: false })
    .limit(50);

  if (!recentMsgs || recentMsgs.length < 6) {
    return { isBot: false, score: 0, reasons: [] };
  }

  const inboundMsgs = recentMsgs.filter((m: any) => !m.is_from_me);
  const outboundMsgs = recentMsgs.filter((m: any) => m.is_from_me);

  // 1. REPETIÇÃO: mesma mensagem 3+ vezes
  const msgCounts = new Map<string, number>();
  for (const msg of inboundMsgs) {
    const key = (msg.content || '').trim().toLowerCase().substring(0, 100);
    if (key.length > 10) {
      msgCounts.set(key, (msgCounts.get(key) || 0) + 1);
    }
  }
  const maxRepeat = Math.max(0, ...Array.from(msgCounts.values()));
  if (maxRepeat >= 3) {
    score += 2;
    reasons.push(`mensagem repetida ${maxRepeat}x`);
  }

  // 2. PADRÃO BOT: mensagens típicas de chatbots corporativos
  const botPatterns = [
    /ao continuar nessa conversa.*voc[êe] concorda/i,
    /pol[íi]tica de privacidade/i,
    /nos informe.*e-?mail/i,
    /parece que.*informou.*inv[áa]lido/i,
    /estamos.*transferindo.*suporte/i,
    /nosso suporte.*dedicado.*outro n[úu]mero/i,
    /clique no link.*inicie.*atendimento/i,
    /seja muito bem[- ]vindo/i,
    /para facilitar.*atendimento/i,
    /nome@email\.com/i,
  ];

  let botPatternHits = 0;
  for (const msg of inboundMsgs) {
    const content = msg.content || '';
    for (const pattern of botPatterns) {
      if (pattern.test(content)) {
        botPatternHits++;
        break; // Uma msg pode matching múltiplos patterns, contamos 1x
      }
    }
  }
  if (botPatternHits >= 3) {
    score += 2;
    reasons.push(`${botPatternHits} msgs com padrão de chatbot`);
  }

  // 3. VELOCIDADE: respostas muito rápidas (<3s após msg do agente)
  let fastResponseCount = 0;
  for (let i = 0; i < recentMsgs.length - 1; i++) {
    const curr = recentMsgs[i];
    const prev = recentMsgs[i + 1];
    // Inbound seguido de outbound (ou vice-versa) com <3s
    if (curr.is_from_me !== prev.is_from_me) {
      const diff = Math.abs(
        new Date(curr.sent_at).getTime() - new Date(prev.sent_at).getTime()
      );
      if (diff < 3000) fastResponseCount++;
    }
  }
  if (fastResponseCount >= 4) {
    score += 2;
    reasons.push(`${fastResponseCount} respostas em <3s`);
  }

  // 4. LOOP: Agente já tentou marcar como perdido (tool_call mark_as_lost) 2+ vezes
  const { count: lostAttempts } = await supabase
    .from('ai_agent_logs')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('type', 'tool_call')
    .like('content', '%mark_as_lost%')
    .gte('created_at', twoHoursAgo);

  if (lostAttempts && lostAttempts >= 2) {
    score += 3;
    reasons.push(`agente tentou mark_as_lost ${lostAttempts}x`);
  }

  // 5. VOLUME: muitas mensagens em pouco tempo
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentCount = recentMsgs.filter(
    (m: any) => m.sent_at >= oneHourAgo
  ).length;
  if (recentCount >= 30) {
    score += 2;
    reasons.push(`${recentCount} msgs em <1h`);
  }

  const isBot = score >= 3;

  if (isBot) {
    console.warn(`🤖 BOT DETECTADO para lead ${leadId} (score: ${score}): ${reasons.join(', ')}`);
  }

  return { isBot, score, reasons };
}

/**
 * Bloqueia um número e pausa a conversa do agente.
 */
async function blockPhoneAndPauseConversation(
  supabase: any,
  phone: string,
  leadId: string,
  reasons: string[],
  score: number,
): Promise<void> {
  const normalizedPhone = phone.replace(/\D/g, '');

  // 1. Adicionar à lista de bloqueados
  await supabase
    .from('blocked_phones')
    .upsert({
      phone: normalizedPhone,
      reason: 'bot_detected_auto',
      blocked_by: 'auto',
      metadata: { reasons, score, lead_id: leadId, detected_at: new Date().toISOString() },
    }, { onConflict: 'phone' });

  // 2. Completar todas as conversas ativas do lead
  await supabase
    .from('ai_agent_conversations')
    .update({ status: 'completed' })
    .eq('lead_id', leadId)
    .eq('status', 'active');

  // 3. Completar cadências ativas
  await supabase
    .from('ai_agent_cadence_enrollments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('status', 'active');

  console.log(`🚫 Número ${normalizedPhone} bloqueado e conversas pausadas (score: ${score})`);
}

/**
 * Substitui variáveis de template por dados do lead
 */
/**
 * Extrai primeiro nome e formata (ex: "RAPHAEL COELHO" → "raphael", "joão silva" → "joão")
 * Remove notas entre parênteses (ex: "Matheus Oliveira (marcos paulo e iallas)" → "matheus")
 */
function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  // Remover tudo entre parênteses (notas internas)
  const cleaned = fullName.replace(/\s*\(.*?\)\s*/g, '').trim();
  const first = cleaned.split(/\s+/)[0];
  return first.toLowerCase();
}

/**
 * Extrai o melhor primeiro nome legível de um lead.
 * Prioridade: name (se real) → senderName (push_name WhatsApp) → email (parte antes do @) → instagram (sem @).
 * Evita retornar handles (@michellecoelho), emails ou strings sem sentido.
 */
function getLeadDisplayName(lead: { name?: string; email?: string; instagram?: string }, senderName?: string): string {
  // Helper: checa se parece um nome real (tem espaço OU é uma palavra capitalizada sem @/./)
  const looksLikeName = (s: string): boolean => {
    if (!s) return false;
    const t = s.trim();
    if (t.includes('@') || t.includes('.com') || t.includes('.br')) return false;
    // Se tem espaço, provavelmente é "Nome Sobrenome"
    if (/\s/.test(t)) return true;
    // Se é uma única palavra alfabética com >2 chars, OK (aceita UPPERCASE, lowercase, mixed)
    if (/^[A-Za-zÀ-ÿ]{3,}$/u.test(t)) return true;
    return false;
  };

  const capitalize = (s: string): string =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  // 1. Tentar name do lead
  if (lead.name) {
    const cleaned = lead.name.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (looksLikeName(cleaned)) {
      return capitalize(cleaned.split(/\s+/)[0]);
    }
  }

  // 1b. Tentar sender_name (push_name do WhatsApp) — mais confiável que email
  if (senderName) {
    const cleaned = senderName.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (looksLikeName(cleaned)) {
      return capitalize(cleaned.split(/\s+/)[0]);
    }
  }

  // 2. Tentar extrair do email (parte antes do @, sem números/pontos)
  if (lead.email) {
    const local = lead.email.split('@')[0]; // "michelle.coelho" ou "michellecoelho"
    // Separar por . ou _ e pegar a primeira parte
    const namePart = local.split(/[._\-+]/)[0];
    if (namePart && namePart.length >= 2 && !/^\d+$/.test(namePart)) {
      return capitalize(namePart);
    }
  }

  // 3. Tentar instagram (remover @)
  if (lead.instagram) {
    const handle = lead.instagram.replace(/^@/, '').trim();
    // Tentar separar por . ou _
    const parts = handle.split(/[._]/);
    if (parts[0] && parts[0].length >= 2 && !/^\d+$/.test(parts[0])) {
      return capitalize(parts[0]);
    }
  }

  // 4. Fallback: usar o name original lowercase (melhor que nada)
  if (lead.name) {
    return lead.name.replace(/^@/, '').split(/[\s._@]/)[0].toLowerCase();
  }

  return '';
}

/** Extrai o sender_name (push_name WhatsApp) da mensagem inbound mais recente */
function extractSenderName(messages: any[] | null | undefined): string | undefined {
  if (!messages) return undefined;
  const inbound = messages.find((m: any) => !m.is_from_me && m.sender_name);
  return inbound?.sender_name || undefined;
}

function replaceVariables(text: string, lead: Lead, extras?: { closer?: string }): string {
  const firstName = getFirstName(lead.name);
  return text
    .replace(/\{\{nome\}\}/g, firstName)
    .replace(/\{\{nome_completo\}\}/g, lead.name || '')
    .replace(/\{\{telefone\}\}/g, lead.phone || '')
    .replace(/\{\{email\}\}/g, lead.email || '')
    .replace(/\{\{empresa\}\}/g, lead.company_name || '')
    .replace(/\{\{cargo\}\}/g, lead.job_title || '')
    .replace(/\{\{estagio\}\}/g, lead.pipeline_stage_name || lead.sales_stage || '')
    .replace(/\{\{score\}\}/g, String(lead.sales_score || 0))
    .replace(/\{\{lead_origem\}\}/g, lead.utm_source || lead.source || '')
    .replace(/\{\{lead_campanha\}\}/g, lead.utm_campaign || '')
    .replace(/\{\{lead_conteudo\}\}/g, lead.utm_content || '')
    .replace(/\{\{lead_contexto\}\}/g, lead.context || '')
    .replace(/\{\{tags\}\}/g, (lead.tags || []).join(', ') || '')
    .replace(/\{\{closer\}\}/g, extras?.closer || '');
}

/**
 * Envia imagem via UAZAPI
 */
async function sendWhatsAppImage(
  instance: WhatsAppInstance,
  phone: string,
  imageUrl: string,
  caption?: string
): Promise<boolean> {
  try {
    const cleanPhone = phone.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '');

    // Cloud API: rotear via edge function
    if (instance.metadata?.type === 'cloud_api') {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-cloud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_image", phone: cleanPhone, media_url: imageUrl, caption }),
      });
      const data = await res.json();
      console.log("📤 Imagem enviada (Cloud API):", JSON.stringify(data));
      return res.ok && !data.error;
    }

    const response = await fetch(`${instance.api_url}/send/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "token": instance.api_key,
      },
      body: JSON.stringify({
        number: cleanPhone,
        type: "image",
        file: imageUrl,
        text: caption || '',
      }),
    });
    const result = await response.json();
    console.log("📤 Imagem enviada:", JSON.stringify(result));
    return response.ok;
  } catch (error) {
    console.error("❌ Erro ao enviar imagem:", error);
    return false;
  }
}

/**
 * Envia vídeo via UAZAPI ou Cloud API
 */
async function sendWhatsAppVideo(
  instance: WhatsAppInstance,
  phone: string,
  videoUrl: string,
  caption?: string
): Promise<boolean> {
  try {
    const cleanPhone = phone.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '');

    // Cloud API: enviar como video nativo
    if (instance.metadata?.type === 'cloud_api') {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-cloud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_video", phone: cleanPhone, media_url: videoUrl, caption }),
      });
      const data = await res.json();
      console.log("📤 Vídeo enviado (Cloud API):", JSON.stringify(data));
      return res.ok && !data.error;
    }

    const response = await fetch(`${instance.api_url}/send/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "token": instance.api_key,
      },
      body: JSON.stringify({
        number: cleanPhone,
        type: "video",
        file: videoUrl,
        text: caption || '',
      }),
    });
    const result = await response.json();
    console.log("📤 Vídeo enviado:", JSON.stringify(result));
    return response.ok;
  } catch (error) {
    console.error("❌ Erro ao enviar vídeo:", error);
    return false;
  }
}

/**
 * Envia áudio via UAZAPI ou Cloud API
 */
async function sendWhatsAppAudio(
  instance: WhatsAppInstance,
  phone: string,
  audioUrl: string
): Promise<boolean> {
  try {
    const cleanPhone = phone.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '');

    // Cloud API: enviar via edge function
    if (instance.metadata?.type === 'cloud_api') {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-cloud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_audio", phone: cleanPhone, media_url: audioUrl }),
      });
      const data = await res.json();
      console.log("📤 Áudio enviado (Cloud API):", JSON.stringify(data));
      return res.ok && !data.error;
    }

    const response = await fetch(`${instance.api_url}/send/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "token": instance.api_key,
      },
      body: JSON.stringify({
        number: cleanPhone,
        type: "audio",
        file: audioUrl,
      }),
    });
    const result = await response.json();
    console.log("📤 Áudio enviado:", JSON.stringify(result));
    return response.ok;
  } catch (error) {
    console.error("❌ Erro ao enviar áudio:", error);
    return false;
  }
}

/**
 * Alerta de WhatsApp desconectado — envia pro grupo TIME-IAP via CAROL
 * Cooldown de 30 min para não spammar
 */
let lastDisconnectAlertAt = 0;
const DISCONNECT_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutos

async function notifyWhatsAppDisconnected(supabase: any, disconnectedInstance: WhatsAppInstance, errorMsg: string) {
  const now = Date.now();
  if (now - lastDisconnectAlertAt < DISCONNECT_ALERT_COOLDOWN_MS) return;
  lastDisconnectAlertAt = now;

  try {
    // Buscar instância CAROL (conectada) para enviar o alerta
    const { data: carolInstance } = await supabase
      .from('whatsapp_instances')
      .select('id, name, api_url, api_key, phone_number')
      .eq('name', 'CAROL')
      .single();

    if (!carolInstance?.api_key) {
      console.error('⚠️ CAROL não encontrada para enviar alerta de desconexão');
      return;
    }

    const brasilia = new Date(now - 3 * 60 * 60 * 1000);
    const data = brasilia.toLocaleDateString('pt-BR');
    const hora = brasilia.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const alertMsg = `🚨 *ALERTA: WhatsApp Desconectado*\n\nA instância *${disconnectedInstance.name}* (${disconnectedInstance.phone_number || 'sem número'}) desconectou do WhatsApp.\n\n⚠️ O agente de IA NÃO está conseguindo enviar mensagens!\n\nErro: ${errorMsg}\n\nPor favor, reconectem a instância o mais rápido possível.\n\n🕐 Detectado em: ${data} às ${hora}`;

    // Enviar para grupo TIME - IAP
    const groupJid = '120363421838905056@g.us';
    const alertIsEvolution = carolInstance.api_url && !carolInstance.api_url.includes('uazapi');
    const alertInstName = encodeURIComponent(carolInstance.name || '');
    await fetch(
      alertIsEvolution
        ? `${carolInstance.api_url}/message/sendText/${alertInstName}`
        : `${carolInstance.api_url}/send/text`,
      {
        method: 'POST',
        headers: alertIsEvolution
          ? { 'Content-Type': 'application/json', 'apikey': carolInstance.api_key }
          : { 'Content-Type': 'application/json', 'token': carolInstance.api_key },
        body: JSON.stringify({ number: groupJid, text: alertMsg }),
      }
    );

    console.log('🚨 Alerta de WhatsApp desconectado enviado para TIME - IAP');
  } catch (err: any) {
    console.error('⚠️ Erro ao enviar alerta de desconexão:', err.message);
  }
}

/**
 * Resolve o telefone real do lead para envio via WhatsApp.
 * Prioriza o remote_jid da última mensagem INBOUND (número confirmado pelo WhatsApp)
 * sobre o lead.phone do banco (que pode ter dígito 9 extra ou formato diferente).
 * Se não houver mensagem inbound, retorna lead.phone como fallback.
 */
async function resolveLeadPhone(
  supabase: any,
  leadId: string,
  leadPhone: string,
): Promise<string> {
  try {
    const { data: lastInbound } = await supabase
      .from('whatsapp_messages')
      .select('remote_jid')
      .eq('lead_id', leadId)
      .eq('is_from_me', false)
      .is('group_id', null)
      .not('remote_jid', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastInbound?.remote_jid) {
      const jidPhone = lastInbound.remote_jid
        .replace('@s.whatsapp.net', '')
        .replace('@lid', '')
        .replace(/[^0-9]/g, '');

      if (jidPhone && jidPhone.length >= 10) {
        if (jidPhone !== leadPhone.replace(/[^0-9]/g, '')) {
          console.log(`📞 resolveLeadPhone: corrigindo telefone do lead ${leadId}: DB="${leadPhone}" → WhatsApp="${jidPhone}"`);
          // Auto-corrigir no banco para evitar divergência futura
          await supabase
            .from('leads')
            .update({ phone: jidPhone })
            .eq('id', leadId);
        }
        return jidPhone;
      }
    }
  } catch (err: any) {
    console.error('⚠️ resolveLeadPhone erro (usando lead.phone como fallback):', err.message);
  }
  return leadPhone?.replace(/[^0-9]/g, '') || '';
}

/**
 * Envia mensagem via UAZAPI com simulação de digitação
 * e insere direto no banco (sem esperar webhook) pra Realtime funcionar instantaneamente
 */
async function sendWhatsAppMessage(
  instance: WhatsAppInstance,
  phone: string,
  message: string,
  simulateTyping: boolean = true,
  supabaseClient?: any,
  leadId?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // ===== CLOUD API (instância oficial Meta) =====
    if (instance.metadata?.type === 'cloud_api') {
      return await sendViaCloudAPI(instance, phone, message, supabaseClient, leadId);
    }

    // Detectar provider pelo api_url (UAZAPI vs Evolution API)
    const isEvolutionApi = instance.api_url && !instance.api_url.includes('uazapi');
    const formattedPhone = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    const cleanPhone = phone.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');

    let response: Response;

    if (isEvolutionApi) {
      // ===== Evolution API =====
      const instanceName = encodeURIComponent(instance.name || '');
      response = await fetch(`${instance.api_url}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": instance.api_key,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: message,
        }),
      });
    } else {
      // ===== UAZAPI =====
      // Simular "digitando..."
      if (simulateTyping) {
        await fetch(`${instance.api_url}/chat/presence`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "token": instance.api_key,
          },
          body: JSON.stringify({
            number: formattedPhone,
            presence: "composing",
          }),
        }).catch(() => {}); // Ignora erros de presence
      }

      response = await fetch(`${instance.api_url}/send/text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "token": instance.api_key,
        },
        body: JSON.stringify({
          number: formattedPhone,
          text: message,
        }),
      });
    }

    const result = await response.json();
    console.log("📤 Mensagem enviada:", result);

    if (!response.ok || result.error) {
      const errorMsg = result.error || result.message || `HTTP ${response.status}`;
      console.error(`❌ Erro ${isEvolutionApi ? 'Evolution API' : 'UAZAPI'}:`, errorMsg);
      return { ok: false, error: errorMsg };
    }

    // Inserir direto no banco pra Realtime instantâneo
    if (supabaseClient && leadId) {
      const uazapiMessageId = result.id || result.key?.id || `agent_${Date.now()}`;
      await supabaseClient
        .from('whatsapp_messages')
        .insert({
          instance_id: instance.id,
          remote_jid: `${cleanPhone}@s.whatsapp.net`,
          message_id: uazapiMessageId,
          message_type: 'Conversation',
          content: message,
          is_from_me: true,
          sender_phone: '',
          sent_at: new Date().toISOString(),
          lead_id: leadId,
          metadata: { sent_by: 'ai_agent' },
        })
        .then(({ error: insertErr }: any) => {
          if (insertErr) {
            console.log('⚠️ Insert direto falhou (webhook vai inserir):', insertErr.message);
          } else {
            console.log('✅ Msg inserida direto no banco (Realtime instantâneo)');
          }
        });
    }

    return { ok: true };
  } catch (error: any) {
    console.error("❌ Erro ao enviar mensagem:", error);
    return { ok: false, error: error.message || 'Erro de conexão' };
  }
}

/**
 * Envia mensagem via WhatsApp Cloud API (Meta oficial)
 */
async function sendViaCloudAPI(
  instance: WhatsAppInstance,
  phone: string,
  message: string,
  supabaseClient?: any,
  leadId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const cleanPhone = phone.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');

  console.log(`📤 [Cloud API] Enviando para ${cleanPhone}: "${message.substring(0, 50)}..."`);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-cloud`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "send_text",
      phone: cleanPhone,
      text: message,
      lead_id: leadId,
    }),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    console.error("❌ [Cloud API] Erro:", result.error || result);
    return { ok: false, error: result.error || `HTTP ${response.status}` };
  }

  console.log(`✅ [Cloud API] Enviado! Message ID: ${result.message_id}`);
  return { ok: true };
}

/**
 * Envia múltiplas mensagens com delays humanizados
 */
async function sendHumanizedResponse(
  instance: WhatsAppInstance,
  phone: string,
  fullMessage: string,
  settings: AgentSettings,
  supabaseClient?: any,
  leadId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const messages = splitMessageNaturally(fullMessage, settings.message_split_max_length);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Delay antes de enviar (exceto primeira mensagem)
    if (i > 0) {
      const delay = calculateResponseDelay(settings, msg.length);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const result = await sendWhatsAppMessage(instance, phone, msg, true, supabaseClient, leadId);
    if (!result.ok) return { ok: false, error: result.error || 'Falha ao enviar mensagem' };

    // Delay entre mensagens (configurável)
    if (i < messages.length - 1) {
      const delayBetween = settings.delay_between_messages_min_ms +
        Math.random() * (settings.delay_between_messages_max_ms - settings.delay_between_messages_min_ms);
      await new Promise(resolve => setTimeout(resolve, delayBetween));
    }
  }

  return { ok: true };
}

/**
 * Labels legíveis para tool calls na conversa WhatsApp interna
 */
function getToolLabel(toolName: string, actionType: string): string {
  const labels: Record<string, string> = {
    qualify_bant: 'Qualificou Lead',
    schedule_meeting: 'Agendou Reunião',
    check_availability: 'Verificou Agenda',
    update_lead: 'Atualizou Lead',
    notify_human: 'Transferiu p/ Humano',
    change_stage: 'Mudou Etapa',
    query_products: 'Consultou Produtos',
    send_whatsapp: 'Enviou WhatsApp',
    mark_lost: 'Marcou como Perdido',
    confirm_meeting: 'Confirmou Reunião',
    reschedule_meeting: 'Reagendou/Cancelou Reunião',
  };
  return labels[actionType] || toolName;
}

function formatToolArgs(actionType: string, args: Record<string, any>): string {
  const parts: string[] = [];
  switch (actionType) {
    case 'qualify_bant':
      if (args.company_name) parts.push(`Empresa: ${args.company_name}`);
      if (args.employee_count) parts.push(`Funcionários: ${args.employee_count}`);
      if (args.monthly_revenue) parts.push(`Faturamento: ${args.monthly_revenue}`);
      if (args.challenges) parts.push(`Desafios: ${args.challenges}`);
      if (args.budget) parts.push(`Budget: ${args.budget}`);
      if (args.authority) parts.push(`Decisor: ${args.authority}`);
      if (args.need) parts.push(`Necessidade: ${args.need}`);
      if (args.timeline) parts.push(`Prazo: ${args.timeline}`);
      break;
    case 'schedule_meeting':
      if (args.preferred_date) parts.push(`Data: ${args.preferred_date}`);
      if (args.preferred_time) parts.push(`Hora: ${args.preferred_time}`);
      if (args.meeting_type) parts.push(`Tipo: ${args.meeting_type}`);
      break;
    case 'update_lead':
      if (args.company_name) parts.push(`Empresa: ${args.company_name}`);
      if (args.employee_count) parts.push(`Funcionários: ${args.employee_count}`);
      if (args.monthly_revenue) parts.push(`Faturamento: ${args.monthly_revenue}`);
      if (args.challenges) parts.push(`Desafios: ${args.challenges}`);
      if (args.name) parts.push(`Nome: ${args.name}`);
      if (args.email) parts.push(`Email: ${args.email}`);
      break;
    case 'change_stage':
      if (args.new_stage) parts.push(`Nova etapa: ${args.new_stage}`);
      break;
    case 'check_availability':
      if (args.date) parts.push(`Data: ${args.date}`);
      break;
    case 'mark_lost':
      if (args.reason) parts.push(`Motivo: ${args.reason}`);
      break;
    case 'confirm_meeting':
      parts.push('Lead confirmou presença na reunião');
      if (args.note) parts.push(`Nota: ${args.note}`);
      break;
    case 'confirm_webinar':
      parts.push('Lead inscrito no webinário semanal');
      break;
    case 'reschedule_meeting':
      if (args.action === 'cancel') parts.push('Cancelou reunião');
      else {
        if (args.new_date) parts.push(`Nova data: ${args.new_date}`);
        if (args.new_time) parts.push(`Hora: ${args.new_time}`);
      }
      if (args.reason) parts.push(`Motivo: ${args.reason}`);
      break;
    default:
      const keys = Object.keys(args).slice(0, 3);
      keys.forEach(k => parts.push(`${k}: ${args[k]}`));
  }
  return parts.length > 0 ? parts.join(' | ') : '(sem parâmetros)';
}

/**
 * Marca mensagens recentes enviadas pelo agente IA no whatsapp_messages.metadata
 * Chamada após o envio de mensagens para identificar visualmente no chat
 */
async function markRecentMessagesAsAI(
  supabase: any,
  leadId: string,
  agentId: string,
  agentName: string,
  sinceTimestamp: string
): Promise<void> {
  try {
    // Aguardar webhook processar a mensagem enviada
    await new Promise(resolve => setTimeout(resolve, 3000));

    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('id, metadata')
      .eq('lead_id', leadId)
      .eq('is_from_me', true)
      .is('group_id', null)
      .gte('sent_at', sinceTimestamp)
      .order('sent_at', { ascending: false });

    if (!messages || messages.length === 0) {
      // Retry once after 3s more
      await new Promise(resolve => setTimeout(resolve, 3000));
      const { data: retryMsgs } = await supabase
        .from('whatsapp_messages')
        .select('id, metadata')
        .eq('lead_id', leadId)
        .eq('is_from_me', true)
        .is('group_id', null)
        .gte('sent_at', sinceTimestamp)
        .order('sent_at', { ascending: false });

      if (!retryMsgs || retryMsgs.length === 0) return;

      for (const msg of retryMsgs) {
        const existing = msg.metadata || {};
        if (existing.sent_by) continue;
        await supabase
          .from('whatsapp_messages')
          .update({ metadata: { ...existing, sent_by: 'ai_agent', agent_id: agentId, agent_name: agentName } })
          .eq('id', msg.id);
      }
      console.log(`🤖 Marcadas ${retryMsgs.length} mensagens como AI (retry) para lead ${leadId}`);
      return;
    }

    for (const msg of messages) {
      const existing = msg.metadata || {};
      if (existing.sent_by) continue;
      await supabase
        .from('whatsapp_messages')
        .update({ metadata: { ...existing, sent_by: 'ai_agent', agent_id: agentId, agent_name: agentName } })
        .eq('id', msg.id);
    }
    console.log(`🤖 Marcadas ${messages.length} mensagens como AI para lead ${leadId}`);
  } catch (error) {
    console.error('❌ Erro ao marcar mensagens como AI:', error);
  }
}

// ==================== OPENAI TOOLS ====================

/**
 * Converte tools do banco para formato OpenAI
 */
function convertToolsToOpenAI(tools: AgentTool[]): any[] {
  return tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Chama LLM com tools (OpenAI ou Anthropic - detecta automaticamente pelo model name)
 */
async function callOpenAIWithTools(
  supabase: any,
  agent: AgentConfig,
  tools: AgentTool[],
  lead: Lead,
  conversationHistory: any[],
  newMessage: string,
  materials?: any[]
): Promise<{ message: string; toolCalls: any[] }> {
  // Fallback se model vier vazio
  if (!agent.model) {
    console.warn('⚠️ Model vazio no agent, usando fallback claude-sonnet-4-6');
    agent.model = 'claude-sonnet-4-6';
  }
  const settings = mergeSettings(agent.settings);
  const systemPrompt = await buildAgentSystemPrompt(supabase, agent, lead, settings, materials);
  const openaiTools = convertToolsToOpenAI(tools);

  console.log(`📝 System prompt length: ${systemPrompt.length} chars | Model: ${agent.model}`);

  // Montar histórico filtrado
  const historyLimit = settings.conversation_history_limit;
  const filteredHistory = conversationHistory
    .filter((m: any) => !m.is_internal && (m.role === 'user' || m.role === 'assistant'))
    .slice(-historyLimit);

  // === ANTHROPIC ===
  if (isAnthropicModel(agent.model)) {
    // Converter tools para formato Anthropic
    const anthropicTools = openaiTools.map((t: any) => ({
      name: t.function.name,
      description: t.function.description || "",
      input_schema: t.function.parameters || { type: "object", properties: {} },
    }));

    // Montar mensagens com alternância garantida
    const anthropicMessages: { role: string; content: string }[] = [];
    for (const m of filteredHistory) {
      const content = m.content || '';
      if (!content.trim()) continue; // Skip empty messages
      const role = m.is_from_agent ? "assistant" : "user";
      const last = anthropicMessages[anthropicMessages.length - 1];
      if (last && last.role === role) {
        last.content += '\n' + content;
      } else {
        anthropicMessages.push({ role, content });
      }
    }
    // Adicionar nova mensagem do user
    const last = anthropicMessages[anthropicMessages.length - 1];
    if (last && last.role === "user") {
      last.content += '\n' + newMessage;
    } else {
      anthropicMessages.push({ role: "user", content: newMessage });
    }

    // Safety: ensure all messages have non-empty string content
    const safeMessages = anthropicMessages.filter(m => m.content != null && String(m.content).trim() !== '');
    // Ensure first message is from user (Anthropic requirement)
    if (safeMessages.length > 0 && safeMessages[0].role !== 'user') {
      safeMessages.unshift({ role: 'user', content: 'Contexto da conversa anterior:' });
    }
    // Ensure last message is from user (Anthropic requirement — no assistant prefill)
    if (safeMessages.length > 0 && safeMessages[safeMessages.length - 1].role !== 'user') {
      safeMessages.push({ role: 'user', content: '(o lead está aguardando sua resposta)' });
    }

    console.log(`📤 Anthropic messages: ${safeMessages.length} msgs, roles: ${safeMessages.map((m: any) => m.role[0]).join(',')}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(sanitizeForJSON({
        model: agent.model,
        system: systemPrompt,
        messages: safeMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        temperature: agent.temperature,
        max_tokens: Math.min(agent.max_tokens, 8192),
      })),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json();

    // Normalizar resposta para formato compatível com OpenAI
    let message = "";
    const toolCalls: any[] = [];
    for (const block of data.content || []) {
      if (block.type === "text") {
        message += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return { message, toolCalls };
  }

  // === OPENAI ===
  const messages = [
    { role: "system", content: systemPrompt },
    ...filteredHistory
      .filter((m: any) => m.content && m.content.trim())
      .map((m: any) => ({
        role: m.is_from_agent ? "assistant" : "user",
        content: m.content,
      })),
    { role: "user", content: newMessage },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: agent.model,
      messages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      tool_choice: openaiTools.length > 0 ? "auto" : undefined,
      temperature: agent.temperature,
      max_tokens: Math.min(agent.max_tokens, 16384),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  return {
    message: choice.message.content || "",
    toolCalls: choice.message.tool_calls || [],
  };
}

/**
 * Segunda chamada ao LLM após executar tools - para gerar mensagem de resposta
 * Suporta OpenAI e Anthropic
 */
async function callOpenAIFollowUp(
  supabase: any,
  agent: AgentConfig,
  tools: AgentTool[],
  lead: Lead,
  conversationHistory: any[],
  userMessage: string,
  toolCalls: any[],
  toolResults: any[],
  materials?: any[]
): Promise<{ message: string; toolCalls: any[] }> {
  const settings = mergeSettings(agent.settings);
  const systemPrompt = await buildAgentSystemPrompt(supabase, agent, lead, settings, materials);

  const historyLimit = settings.conversation_history_limit;
  const filteredHistory = conversationHistory
    .filter((m: any) => !m.is_internal && (m.role === 'user' || m.role === 'assistant'))
    .slice(-historyLimit);

  // Converter tools para os formatos necessários (para permitir encadeamento de tool calls)
  const openaiTools = convertToolsToOpenAI(tools);
  const anthropicTools = openaiTools.map((t: any) => ({
    name: t.function.name,
    description: t.function.description || "",
    input_schema: t.function.parameters || { type: "object", properties: {} },
  }));

  // === ANTHROPIC ===
  if (isAnthropicModel(agent.model)) {
    // Montar mensagens com alternância
    const anthropicMessages: any[] = [];
    for (const m of filteredHistory) {
      const content = m.content || '';
      if (!content.trim()) continue; // Skip empty messages
      const role = m.is_from_agent ? "assistant" : "user";
      const last = anthropicMessages[anthropicMessages.length - 1];
      if (last && last.role === role) {
        if (typeof last.content === 'string') {
          last.content += '\n' + content;
        }
      } else {
        anthropicMessages.push({ role, content });
      }
    }
    // Adicionar mensagem do user
    const lastMsg = anthropicMessages[anthropicMessages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      if (typeof lastMsg.content === 'string') {
        lastMsg.content += '\n' + userMessage;
      }
    } else {
      anthropicMessages.push({ role: "user", content: userMessage });
    }
    // Resposta do assistant com tool_use blocks
    anthropicMessages.push({
      role: "assistant",
      content: toolCalls.map(tc => ({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      })),
    });
    // Resultados das tools como user message com tool_result blocks
    anthropicMessages.push({
      role: "user",
      content: toolResults.map(tr => ({
        type: "tool_result",
        tool_use_id: tr.tool_call_id,
        content: JSON.stringify(tr.result),
      })),
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(sanitizeForJSON({
        model: agent.model,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        temperature: agent.temperature,
        max_tokens: Math.min(agent.max_tokens, 8192),
      })),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic follow-up error: ${error}`);
    }

    const data = await response.json();
    let message = "";
    const newToolCalls: any[] = [];
    for (const block of data.content || []) {
      if (block.type === "text") {
        message += block.text;
      } else if (block.type === "tool_use") {
        newToolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }
    return { message, toolCalls: newToolCalls };
  }

  // === OPENAI ===
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...filteredHistory
      .filter((m: any) => m.content && m.content.trim())
      .map((m: any) => ({
        role: m.is_from_agent ? "assistant" : "user",
        content: m.content,
      })),
    { role: "user", content: userMessage },
    {
      role: "assistant",
      content: null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: "function",
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    },
    ...toolResults.map(tr => ({
      role: "tool",
      tool_call_id: tr.tool_call_id,
      content: JSON.stringify(tr.result),
    })),
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: agent.model,
      messages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      tool_choice: openaiTools.length > 0 ? "auto" : undefined,
      temperature: agent.temperature,
      max_tokens: Math.min(agent.max_tokens, 16384),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI follow-up error: ${error}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  return {
    message: choice.message.content || "",
    toolCalls: choice.message.tool_calls || [],
  };
}

/**
 * Busca contexto completo do lead - usando limites configuráveis
 */
async function getFullLeadContext(supabase: any, lead: Lead, settings: AgentSettings, instanceId?: string): Promise<string> {
  let context = '';

  // 1. Histórico de mensagens do WhatsApp (limite configurável) - APENAS individuais, sem grupo
  // Filtrar por instância do agente se disponível (isolamento multi-pipeline)
  let msgQuery = supabase
    .from('whatsapp_messages')
    .select('content, is_from_me, sent_at, sender_name')
    .eq('lead_id', lead.id)
    .is('group_id', null)
    .order('sent_at', { ascending: false })
    .limit(settings.context_messages_limit);
  if (instanceId) {
    msgQuery = msgQuery.eq('instance_id', instanceId);
  }
  const { data: messages } = await msgQuery;

  if (messages && messages.length > 0) {
    context += `\n## HISTÓRICO DE CONVERSA (últimas ${messages.length} mensagens)\n`;
    // Inverter para ordem cronológica
    const sortedMessages = [...messages].reverse();
    for (const msg of sortedMessages) {
      const sender = msg.is_from_me ? '🤖 Nós' : `👤 ${lead.name}`;
      const time = new Date(msg.sent_at).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      const content = msg.content?.substring(0, 200) || '[mídia]';
      context += `[${time}] ${sender}: ${content}\n`;
    }
  }

  // 2. Deals/Oportunidades (limite configurável)
  const { data: deals } = await supabase
    .from('deals')
    .select(`
      id, title, negotiated_price, original_price, status, ai_win_probability,
      product:products(name, price),
      pipeline_stage:sales_pipeline_stages(name),
      notes, created_at
    `)
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(settings.context_deals_limit);

  if (deals && deals.length > 0) {
    context += `\n## OPORTUNIDADES DE VENDA\n`;
    for (const deal of deals) {
      const product = deal.product?.name || 'Sem produto';
      const price = deal.negotiated_price || deal.original_price;
      const value = price ? `R$ ${Number(price).toLocaleString('pt-BR')}` : 'Valor não definido';
      const stage = deal.pipeline_stage?.name || 'Sem etapa';
      context += `- "${deal.title}" | ${product} | ${value} | Etapa: ${stage} | Status: ${deal.status}\n`;
      if (deal.notes) {
        context += `  Obs: ${deal.notes.substring(0, 100)}\n`;
      }
    }
  }

  // 3. Produtos de interesse do lead (via campo active_products)
  if (lead.active_products && lead.active_products.length > 0) {
    context += `\n## PRODUTOS DE INTERESSE\n`;
    for (const productName of lead.active_products) {
      context += `- ${productName}\n`;
    }
  }

  // 4. Todos os produtos disponíveis (limite configurável)
  const { data: allProducts } = await supabase
    .from('products')
    .select('name, price, description')
    .eq('is_active', true)
    .limit(settings.context_products_limit);

  if (allProducts && allProducts.length > 0) {
    context += `\n## NOSSOS PRODUTOS/SERVIÇOS DISPONÍVEIS\n`;
    for (const p of allProducts) {
      context += `- ${p.name}: R$ ${p.price?.toLocaleString('pt-BR') || '?'} - ${p.description?.substring(0, 80) || ''}\n`;
    }
  }

  // 5. Tarefas pendentes (limite configurável)
  const { data: tasks } = await supabase
    .from('company_activities')
    .select('name, description, scheduled_at, priority, status')
    .eq('lead_id', lead.id)
    .in('status', ['pending', 'in_progress', 'scheduled'])
    .order('scheduled_at', { ascending: true })
    .limit(settings.context_tasks_limit);

  if (tasks && tasks.length > 0) {
    context += `\n## TAREFAS/FOLLOW-UPS PENDENTES\n`;
    for (const task of tasks) {
      const date = task.scheduled_at ? new Date(task.scheduled_at).toLocaleDateString('pt-BR') : 'Sem data';
      context += `- [${task.priority}] ${task.name} - ${date}\n`;
    }
  }

  // 6. Notas da conversa (limite configurável)
  const { data: notes } = await supabase
    .from('cs_conversation_notes')
    .select('content, note_type, created_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(settings.context_notes_limit);

  if (notes && notes.length > 0) {
    context += `\n## NOTAS/OBSERVAÇÕES DA EQUIPE\n`;
    for (const note of notes) {
      const date = new Date(note.created_at).toLocaleDateString('pt-BR');
      context += `- [${date}] ${note.content.substring(0, 150)}\n`;
    }
  }

  // 7. Transcrições de chamadas (últimas 3 com transcrição)
  try {
    const { data: calls } = await supabase
      .from('call_history')
      .select('id, peer_name, direction, started_at, duration_seconds, ai_summary, ai_key_points, ai_sentiment, transcriptions')
      .eq('lead_id', lead.id)
      .not('transcriptions', 'is', null)
      .order('started_at', { ascending: false })
      .limit(3);

    if (calls && calls.length > 0) {
      context += `\n## HISTÓRICO DE CHAMADAS (com transcrição)\n`;
      for (const call of calls) {
        const date = new Date(call.started_at).toLocaleDateString('pt-BR');
        const dir = call.direction === 'outgoing' ? '📞 Saída' : '📲 Entrada';
        const dur = call.duration_seconds ? `${Math.round(call.duration_seconds / 60)}min` : '';
        context += `\n### ${dir} — ${date} ${dur}\n`;

        if (call.ai_summary) {
          context += `Resumo: ${call.ai_summary.substring(0, 300)}\n`;
        }
        if (call.ai_key_points && Array.isArray(call.ai_key_points)) {
          context += `Pontos-chave: ${call.ai_key_points.slice(0, 5).join('; ')}\n`;
        }
        if (call.ai_sentiment) {
          context += `Sentimento: ${call.ai_sentiment}\n`;
        }

        // Transcrição condensada (últimas falas relevantes)
        if (call.transcriptions && Array.isArray(call.transcriptions)) {
          const transcript = call.transcriptions
            .filter((t: any) => t.text && t.text.length > 10)
            .slice(-20)
            .map((t: any) => {
              const speaker = t.speaker === 'agent' || t.channel === 0 ? '🎙️ Vendedor' : '👤 Cliente';
              return `${speaker}: ${t.text.substring(0, 150)}`;
            })
            .join('\n');
          if (transcript) {
            context += `Transcrição (trechos):\n${transcript}\n`;
          }
        }
      }
    }
  } catch (callErr) {
    console.error('Call history context error (non-fatal):', callErr);
  }

  // 8. Transcrições de reuniões (últimas 3 com transcrição)
  try {
    const { data: meetings } = await supabase
      .from('meetings')
      .select('id, title, started_at, duration_minutes, ai_summary, ai_key_points, ai_sentiment, transcriptions, status')
      .eq('lead_id', lead.id)
      .not('transcriptions', 'is', null)
      .in('status', ['completed', 'active'])
      .order('started_at', { ascending: false })
      .limit(3);

    if (meetings && meetings.length > 0) {
      context += `\n## HISTÓRICO DE REUNIÕES (com transcrição)\n`;
      for (const meeting of meetings) {
        const date = new Date(meeting.started_at).toLocaleDateString('pt-BR');
        const dur = meeting.duration_minutes ? `${meeting.duration_minutes}min` : '';
        context += `\n### 🎥 ${meeting.title || 'Reunião'} — ${date} ${dur}\n`;

        if (meeting.ai_summary) {
          context += `Resumo: ${meeting.ai_summary.substring(0, 300)}\n`;
        }
        if (meeting.ai_key_points && Array.isArray(meeting.ai_key_points)) {
          context += `Pontos-chave: ${meeting.ai_key_points.slice(0, 5).join('; ')}\n`;
        }

        // Transcrição condensada
        if (meeting.transcriptions && Array.isArray(meeting.transcriptions)) {
          const transcript = meeting.transcriptions
            .filter((t: any) => t.text && t.text.length > 10)
            .slice(-20)
            .map((t: any) => {
              const speaker = t.speaker === 'agent' || t.channel === 0 ? '🎙️ Vendedor' : '👤 Cliente';
              return `${speaker}: ${t.text.substring(0, 150)}`;
            })
            .join('\n');
          if (transcript) {
            context += `Transcrição (trechos):\n${transcript}\n`;
          }
        }
      }
    }
  } catch (meetErr) {
    console.error('Meeting history context error (non-fatal):', meetErr);
  }

  // 9. Informações B2B (empresa)
  if (lead.company_name || lead.job_title) {
    context += `\n## INFORMAÇÕES PROFISSIONAIS\n`;
    if (lead.company_name) context += `- Empresa: ${lead.company_name}\n`;
    if (lead.job_title) context += `- Cargo: ${lead.job_title}\n`;
  }

  // 10. Origem do lead
  if (lead.source || lead.utm_source) {
    context += `\n## ORIGEM\n`;
    if (lead.source) context += `- Fonte: ${lead.source}\n`;
    if (lead.utm_source) context += `- UTM Source: ${lead.utm_source}\n`;
    if (lead.utm_medium) context += `- UTM Medium: ${lead.utm_medium}\n`;
    if (lead.utm_campaign) context += `- UTM Campaign: ${lead.utm_campaign}\n`;
    if (lead.utm_content) context += `- UTM Content: ${lead.utm_content}\n`;
  }

  // 11. Tags
  if (lead.tags && lead.tags.length > 0) {
    context += `\n## TAGS\n${lead.tags.join(', ')}\n`;
  }

  // 12. Contexto Instagram — DMs, análise IA, funil social seller
  try {
    const { data: instaConvos } = await supabase
      .from('instagram_conversations')
      .select(`
        id, participant_username, participant_name, status,
        total_messages, last_message, last_client_message_at,
        social_seller_stage:social_seller_stages(name, slug),
        metadata, is_ignored
      `)
      .eq('lead_id', lead.id)
      .order('last_message_at', { ascending: false })
      .limit(2);

    if (instaConvos && instaConvos.length > 0) {
      context += `\n## INSTAGRAM — CONVERSAS (DMs)\n`;

      for (const conv of instaConvos) {
        const stage = (conv.social_seller_stage as any)?.name || 'N/A';
        const stageSlug = (conv.social_seller_stage as any)?.slug || '';
        context += `- @${conv.participant_username || '?'} | Etapa funil: ${stage} | Total msgs: ${conv.total_messages} | Status: ${conv.status}\n`;

        // Análise IA da conversa (se existir)
        const aiAnalysis = (conv.metadata as any)?.ai_analysis;
        if (aiAnalysis) {
          context += `  📊 Análise IA:\n`;
          if (aiAnalysis.resumo) context += `  - Resumo: ${aiAnalysis.resumo}\n`;
          if (aiAnalysis.interesse) context += `  - Nível de interesse: ${aiAnalysis.interesse}\n`;
          if (aiAnalysis.estagio_recomendado) context += `  - Estágio recomendado: ${aiAnalysis.estagio_recomendado}\n`;
          if (aiAnalysis.produtos_mencionados?.length > 0) context += `  - Produtos mencionados: ${aiAnalysis.produtos_mencionados.join(', ')}\n`;
          if (aiAnalysis.objecoes?.length > 0) context += `  - Objeções: ${aiAnalysis.objecoes.join(', ')}\n`;
          if (aiAnalysis.keywords_detectadas?.length > 0) context += `  - Keywords: ${aiAnalysis.keywords_detectadas.join(', ')}\n`;
          if (aiAnalysis.proxima_acao) context += `  - Próxima ação: ${aiAnalysis.proxima_acao}\n`;
        }

        // Últimas mensagens do Instagram DM (até 15)
        const { data: instaMsgs } = await supabase
          .from('instagram_messages')
          .select('content, is_from_me, message_type, sent_at, reference_type, metadata')
          .eq('conversation_id', conv.id)
          .order('sent_at', { ascending: false })
          .limit(15);

        if (instaMsgs && instaMsgs.length > 0) {
          context += `  💬 Últimas ${instaMsgs.length} mensagens no DM:\n`;
          const sorted = [...instaMsgs].reverse();
          for (const msg of sorted) {
            const sender = msg.is_from_me ? '🤖 Nós' : `👤 ${conv.participant_name || conv.participant_username || 'Cliente'}`;
            const time = new Date(msg.sent_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const typeTag = msg.message_type !== 'text' ? ` [${msg.message_type}]` : '';
            const refTag = msg.reference_type ? ` (via ${msg.reference_type})` : '';
            const postCaption = (msg.metadata as any)?.post_caption ? ` | post: "${(msg.metadata as any).post_caption.substring(0, 80)}"` : '';
            const text = msg.content?.substring(0, 200) || '[mídia]';
            context += `  [${time}] ${sender}${typeTag}${refTag}${postCaption}: ${text}\n`;
          }
        }
      }
    }

    // 13. Engajamento Instagram
    const { data: engagement } = await supabase
      .from('instagram_engagement')
      .select('total_dms, total_comments, total_story_replies, total_story_mentions, engagement_score, last_interaction_at, interactions_last_7_days, interactions_last_30_days')
      .eq('lead_id', lead.id)
      .limit(1)
      .maybeSingle();

    if (engagement && engagement.engagement_score > 0) {
      context += `\n## INSTAGRAM — ENGAJAMENTO\n`;
      context += `- Score: ${engagement.engagement_score} | DMs: ${engagement.total_dms} | Comentários: ${engagement.total_comments} | Story replies: ${engagement.total_story_replies}\n`;
      context += `- Últimos 7 dias: ${engagement.interactions_last_7_days} interações | Últimos 30 dias: ${engagement.interactions_last_30_days}\n`;
      if (engagement.last_interaction_at) {
        context += `- Última interação: ${new Date(engagement.last_interaction_at).toLocaleDateString('pt-BR')}\n`;
      }
    }

    // 14. Perfil Instagram do lead — bio, posts recentes (legendas), stories
    if (lead.instagram_profile_id) {
      const { data: profile } = await supabase
        .from('instagram_profiles')
        .select('username, full_name, biography, follower_count, following_count, media_count, is_verified, is_private')
        .eq('id', lead.instagram_profile_id)
        .maybeSingle();

      if (profile) {
        context += `\n## INSTAGRAM — PERFIL DO LEAD\n`;
        context += `- @${profile.username} | ${profile.full_name || ''}\n`;
        if (profile.biography) context += `- Bio: ${profile.biography.substring(0, 200)}\n`;
        context += `- Seguidores: ${profile.follower_count || 0} | Seguindo: ${profile.following_count || 0} | Posts: ${profile.media_count || 0}`;
        if (profile.is_verified) context += ` | ✓ Verificado`;
        if (profile.is_private) context += ` | 🔒 Privado`;
        context += `\n`;
      }

      // Posts recentes (legendas — pra entender o que o lead publica)
      const { data: posts } = await supabase
        .from('instagram_feed_posts')
        .select('caption, like_count, comment_count, play_count, taken_at')
        .eq('instagram_profile_id', lead.instagram_profile_id)
        .order('taken_at', { ascending: false })
        .limit(5);

      if (posts && posts.length > 0) {
        context += `  📸 Posts recentes do lead:\n`;
        for (const post of posts) {
          const date = new Date(post.taken_at).toLocaleDateString('pt-BR');
          const caption = post.caption ? post.caption.substring(0, 120) : '[sem legenda]';
          const stats = `❤️${post.like_count || 0} 💬${post.comment_count || 0}${post.play_count ? ` ▶️${post.play_count}` : ''}`;
          context += `  [${date}] ${caption} (${stats})\n`;
        }
      }

      // Stories recentes com descrição IA
      const { data: stories } = await supabase
        .from('instagram_stories')
        .select('ai_description, taken_at, has_audio, media_type')
        .eq('instagram_profile_id', lead.instagram_profile_id)
        .not('ai_description', 'is', null)
        .order('taken_at', { ascending: false })
        .limit(3);

      if (stories && stories.length > 0) {
        context += `  📖 Stories recentes do lead:\n`;
        for (const story of stories) {
          const date = new Date(story.taken_at).toLocaleDateString('pt-BR');
          const desc = story.ai_description?.substring(0, 150) || '';
          context += `  [${date}] ${desc}\n`;
        }
      }
    }
  } catch (igError) {
    console.error('Instagram context error (non-fatal):', igError);
  }

  return context;
}

/**
 * Monta o system prompt do agente com contexto do lead
 */
async function buildAgentSystemPrompt(supabase: any, agent: AgentConfig, lead: Lead, settings: AgentSettings, materials?: any[]): Promise<string> {
  // Brasília timezone correto (toLocaleString garante dia correto independente do UTC)
  const nowUtc = new Date();
  const brTimeStr = nowUtc.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const today = new Date(brTimeStr);
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const dayOfWeek = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][today.getDay()];

  // Calcular próximos dias da semana para referência do agente
  const weekDays: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dName = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.getDay()];
    const dDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    weekDays.push(`${dName} = ${dDate}`);
  }

  // Substituir variáveis do prompt do usuário
  let userPrompt = agent.system_prompt || '';
  userPrompt = userPrompt.replace(/\{\{nome\}\}/g, lead.name || '');
  userPrompt = userPrompt.replace(/\{\{telefone\}\}/g, lead.phone || '');
  userPrompt = userPrompt.replace(/\{\{email\}\}/g, lead.email || '');
  userPrompt = userPrompt.replace(/\{\{empresa\}\}/g, lead.company_name || '');
  userPrompt = userPrompt.replace(/\{\{cargo\}\}/g, lead.job_title || '');
  userPrompt = userPrompt.replace(/\{\{estagio\}\}/g, lead.pipeline_stage_name || lead.sales_stage || '');
  userPrompt = userPrompt.replace(/\{\{score\}\}/g, String(lead.sales_score || 0));
  userPrompt = userPrompt.replace(/\{\{lead_origem\}\}/g, lead.utm_source || lead.source || '');
  userPrompt = userPrompt.replace(/\{\{lead_campanha\}\}/g, lead.utm_campaign || '');
  userPrompt = userPrompt.replace(/\{\{lead_conteudo\}\}/g, lead.utm_content || '');
  userPrompt = userPrompt.replace(/\{\{lead_contexto\}\}/g, lead.context || '');
  userPrompt = userPrompt.replace(/\{\{tags\}\}/g, (lead.tags || []).join(', ') || '');
  userPrompt = userPrompt.replace(/\{\{bant_orcamento\}\}/g, lead.bant_budget ? 'Sim' : 'Nao');
  userPrompt = userPrompt.replace(/\{\{bant_decisor\}\}/g, lead.bant_authority ? 'Sim' : 'Nao');
  userPrompt = userPrompt.replace(/\{\{bant_necessidade\}\}/g, lead.bant_need ? 'Sim' : 'Nao');
  userPrompt = userPrompt.replace(/\{\{bant_prazo\}\}/g, lead.bant_timeline ? 'Sim' : 'Nao');

  let leadContext = `
## INFORMAÇÕES DO CLIENTE
- Nome: ${lead.name}
- Telefone: ${lead.phone}
- Email: ${lead.email || 'Não informado'}
- Estágio no funil: ${lead.pipeline_stage_name || lead.sales_stage || ''}
- Score de qualificação: ${lead.sales_score || 0}/100
`;

  if (lead.bant_budget !== undefined || lead.bant_authority !== undefined) {
    leadContext += `
## QUALIFICAÇÃO BANT
- Budget (Orçamento): ${lead.bant_budget ? '✓ Confirmado' : '? Não confirmado'}
- Authority (Decisor): ${lead.bant_authority ? '✓ Confirmado' : '? Não confirmado'}
- Need (Necessidade): ${lead.bant_need ? '✓ Confirmado' : '? Não confirmado'}
- Timeline (Prazo): ${lead.bant_timeline ? '✓ Confirmado' : '? Não confirmado'}
`;
  }

  if (lead.context) {
    leadContext += `
## CONTEXTO SALVO
${lead.context}
`;
  }

  // Buscar contexto completo usando limites configuráveis
  const fullContext = await getFullLeadContext(supabase, lead, settings, agent.instance_id);

  // Catálogo de materiais de venda — DESATIVADO
  // Motivo: LLM frequentemente mencionava vídeo/material sem usar a tag correta,
  // fazendo promessas ao lead sem entregar. Reativar quando tiver solução robusta.
  const materialsSection = '';

  // Estado atual injetado no TOPO — prioridade máxima pro LLM
  // Usar toLocaleString pra garantir horário BRT correto
  const timeParts = nowUtc.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
  const timeStr = timeParts;

  const currentState = `⚠️ ESTADO ATUAL (PRIORIDADE MÁXIMA — IGNORA QUALQUER INFORMAÇÃO CONTRÁRIA NO HISTÓRICO):
- DATA E HORA AGORA: ${dateStr} ${timeStr} (${dayOfWeek}) — Horário de Brasília
- Se o histórico da conversa menciona datas/horários diferentes, IGNORE — use APENAS esta data/hora.
- NUNCA diga "hoje às 20h" se já passou das 20h ou se o evento já aconteceu.
---

`;

  return `${currentState}${userPrompt}

---

DATA DE HOJE: ${dateStr} (${dayOfWeek}) — Horário de Brasília (UTC-3)
REFERÊNCIA DOS PRÓXIMOS DIAS:
${weekDays.join('\n')}

${leadContext}
${fullContext}
${materialsSection}

## PERSONALIDADE
${agent.personality_traits.join(', ')}

## REGRAS IMPORTANTES
1. Seja natural e humana - nada de respostas robóticas
2. Respostas curtas (2-3 frases no máximo)
3. Uma pergunta por vez
4. Se o cliente pedir para falar com humano, use a tool notify_human
5. Use o histórico de conversa para dar continuidade natural
6. Mencione informações relevantes que você sabe sobre o cliente quando apropriado
7. Se houver deals/oportunidades, foque neles
8. Nunca invente informações sobre preços - use os valores dos produtos listados
9. Adapte o tom ao cliente
10. REGRA CRÍTICA: SEMPRE analise o HISTÓRICO DE CONVERSA antes de responder. Se já houve mensagens trocadas (suas ou de outro vendedor), NÃO faça primeiro contato. Continue a conversa de onde parou, respondendo à última mensagem do lead. Trate mensagens anteriores de outros vendedores como SUAS — você é a mesma equipe.
15. CUMPRIMENTOS CURTOS ("Olá", "Oi", "Tudo bem", etc): NUNCA responda com frases genéricas tipo "que bom que respondeu", "fico feliz", "que legal". Vá DIRETO ao ponto — cumprimente brevemente e faça a próxima pergunta da sequência. Exemplo correto: "e aí.. tudo certo? me conta.. vc já tem um negócio próprio?" Exemplo ERRADO: "oi! que bom que respondeu 😄 me conta.."
16. NUNCA USE EMOJI — sem exceção. Sem 😄, sem 🤙, sem nenhum. Isso é regra absoluta.
17. NUNCA REPITA PERGUNTA JÁ FEITA — analise o histórico. Se você (ou outro vendedor) já perguntou algo e o lead NÃO respondeu, reformule de outro jeito. Se o lead JÁ respondeu, avance para a próxima etapa. NUNCA copie/cole a mesma pergunta.
11. QUALIFICAÇÃO COM FATURAMENTO MÍNIMO: Para agendar reunião, o lead precisa faturar pelo menos R$30.000/mês. Pergunte o faturamento de forma natural (ex: "como tá o faturamento da empresa hoje?"). Se o lead faturar MENOS de 30k, NÃO agende reunião — agradeça o interesse, diga que no momento o programa é voltado para empresas a partir de 30k de faturamento, mas que você pode indicar conteúdos gratuitos pra ele. Seja empático e positivo, nunca faça o lead se sentir rejeitado. Se o lead não quiser informar o faturamento, pergunte de forma leve no máximo 2 vezes — se ainda não responder, prossiga com o agendamento. Você também precisa do nome da empresa (obrigatório) + pelo menos UM de: quantidade de funcionários OU faturamento mensal. AGENDAMENTO TEM PRIORIDADE sobre qualificação excessiva: se o lead insistir em agendar ou disser "na call passo", RESPEITE e agende imediatamente. Se check_availability retornar erro pedindo qualificação, chame qualify_lead com o que você sabe (use company_name='Não informado' se preciso) e tente novamente. NUNCA repita a mesma pergunta de qualificação mais de 1 vez se o lead já demonstrou vontade de agendar.
14. ATUALIZAÇÃO CONTÍNUA DE DADOS: SEMPRE que o lead mencionar dados novos durante a conversa (faturamento, número de funcionários, desafios, empresa, orçamento, quem decide, prazo), chame qualify_lead IMEDIATAMENTE com esses dados — MESMO que você já tenha chamado qualify_lead antes. Cada nova informação deve ser salva no momento em que aparece. Exemplos: se o lead disse "faturo 40k por mês" → chame qualify_lead com monthly_revenue. Se disse "tenho 4 pessoas no time" → chame qualify_lead com employee_count. NÃO espere acumular dados — salve cada informação assim que o lead compartilhar.
13. AGENDAMENTO OBRIGATÓRIO: SEMPRE chame check_availability ANTES de schedule_meeting para verificar horários livres. Cada reunião dura 45 minutos. NUNCA agende em horário que não esteja nos free_slots retornados. Se o lead sugerir um horário ocupado, informe que aquele horário não está disponível e ofereça os mais próximos.
12. CONFIRMAÇÃO DE CALLS: Quando o lead responder a um lembrete de call/reunião:
   - Se confirmar ("sim", "confirmado", "tamo junto", "ok", "pode ser") → Use a tool confirm_meeting
   - Se disser que não pode → Pergunte o motivo de forma leve e ofereça remarcar. Use reschedule_meeting se ele der nova data.
   - Se quiser cancelar → Pergunte gentilmente se é definitivo ou se prefere remarcar. Use reschedule_meeting com action='cancel' só se for definitivo.
   - Se pedir para remarcar ("remarca pra quinta", "pode ser outro dia?") → Use reschedule_meeting com a nova data
   - Se disser que vai atrasar → Responda "tranquilo, te espero!" de forma natural
   - Se fizer perguntas sobre o produto/call → Responda normalmente
   - NUNCA pressione. Seja compreensivo e flexível.
18. PROIBIDO ENVIAR LINKS: NUNCA envie URLs, links ou endereços web na mensagem. Sem meet.google.com, sem zoom.us, sem nenhum link. Links de reunião são enviados automaticamente pelo sistema nos lembretes. Se o lead pedir um link, diga que o link será enviado automaticamente antes da reunião.
19. VOCÊ NÃO ENTRA EM CALLS: Você é um assistente de texto. NUNCA diga que vai entrar numa call, que "já entro", que "um segundo". Se o lead quiser fazer uma call AGORA, chame notify_human com urgência alta explicando que o lead quer falar ao vivo. Diga ao lead: "vou chamar o [responsável] pra entrar na call com você".
20. SITUAÇÕES QUE EXIGEM notify_human (OBRIGATÓRIO):
   - Lead quer fazer call/reunião AGORA (ao vivo)
   - Lead pede link de reunião
   - Lead pede para falar com alguém
   - Lead demonstra frustração ou urgência
   Nesses casos: chame notify_human E responda ao lead dizendo que vai acionar o responsável.
21. DIFERENÇA CRÍTICA entre schedule_followup e schedule_meeting:
   - schedule_followup = lembrete INTERNO do bot para retomar conversa depois. NÃO agenda call, NÃO envia invite, NÃO cria evento. Use quando VOCÊ quer se lembrar de mandar mensagem pro lead depois.
   - schedule_meeting = agenda uma CALL/REUNIÃO real com o lead. Cria evento no calendário, envia invite por email. Use quando o lead aceitar/pedir uma call.
   - Se o lead disse "me liga amanhã", "vamos marcar uma call", "pode ser quinta" → use schedule_meeting (com check_availability antes).
   - Se VOCÊ quer retomar contato com o lead que sumiu → use schedule_followup.
22. COLETA DE EMAIL: Antes de chamar schedule_meeting, VERIFIQUE as "INFORMAÇÕES DO CLIENTE" acima. Se o email já está preenchido (não é "Não informado"), NÃO peça email ao lead — o sistema já tem. Só peça email se estiver "Não informado" E o lead não mencionou email na conversa.
23. FORMATO DA CALL: Todas as calls são por VÍDEO (Google Meet). NUNCA pergunte se o lead prefere vídeo ou telefone. O link do Meet é enviado automaticamente no invite. Se o lead perguntar, diga que é por vídeo e o link será enviado por email.`;
}

// ==================== TOOL EXECUTION ====================

/**
 * Move lead E deal(s) para um estágio do pipeline pelo nome
 */
async function moveLeadAndDealToStage(supabase: any, leadId: string, currentPipelineStageId: string | null, targetStageName: string): Promise<{ stageId: string | null }> {
  let targetStageId: string | null = null;
  let currentPipelineId: string | null = null;

  if (currentPipelineStageId) {
    const { data: currentStage } = await supabase
      .from('sales_pipeline_stages')
      .select('pipeline_id')
      .eq('id', currentPipelineStageId)
      .single();
    if (currentStage) {
      currentPipelineId = currentStage.pipeline_id;
      const { data: targetStage } = await supabase
        .from('sales_pipeline_stages')
        .select('id')
        .eq('pipeline_id', currentStage.pipeline_id)
        .eq('name', targetStageName)
        .single();
      if (targetStage) {
        targetStageId = targetStage.id;
      }
    }
  }

  // Fallback: buscar em qualquer pipeline
  if (!targetStageId) {
    const { data: anyStage } = await supabase
      .from('sales_pipeline_stages')
      .select('id, pipeline_id')
      .eq('name', targetStageName)
      .limit(1)
      .maybeSingle();
    if (anyStage) {
      targetStageId = anyStage.id;
      currentPipelineId = currentPipelineId || anyStage.pipeline_id;
    }
  }

  if (targetStageId) {
    // Cancelar cadências ativas do agente DESTE pipeline apenas
    if (currentPipelineId) {
      const { data: pipelineAgents } = await supabase
        .from('ai_sales_agents')
        .select('id')
        .eq('pipeline_id', currentPipelineId);
      const agentIds = (pipelineAgents || []).map((a: any) => a.id);
      if (agentIds.length > 0) {
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('lead_id', leadId)
          .eq('status', 'active')
          .in('agent_id', agentIds);
      }
    }

    // Mover lead pipeline_stage_id SOMENTE se o lead está neste mesmo pipeline
    const { data: leadData } = await supabase.from('leads').select('pipeline_stage_id').eq('id', leadId).single();
    if (leadData?.pipeline_stage_id) {
      const { data: leadCurrentStage } = await supabase
        .from('sales_pipeline_stages')
        .select('pipeline_id')
        .eq('id', leadData.pipeline_stage_id)
        .single();
      if (leadCurrentStage?.pipeline_id === currentPipelineId) {
        await supabase.from('leads').update({ pipeline_stage_id: targetStageId }).eq('id', leadId);
      }
    } else {
      // Lead sem pipeline — setar
      await supabase.from('leads').update({ pipeline_stage_id: targetStageId }).eq('id', leadId);
    }

    // Mover deals abertos SOMENTE do MESMO pipeline
    if (currentPipelineId) {
      await supabase
        .from('deals')
        .update({ pipeline_stage_id: targetStageId })
        .eq('lead_id', leadId)
        .eq('pipeline_id', currentPipelineId)
        .not('status', 'in', '("won","lost")');
    }
  }

  return { stageId: targetStageId };
}

/**
 * Move lead E deal(s) para estágio "Perdido" (is_lost = true)
 */
async function moveLeadAndDealToLost(supabase: any, leadId: string, currentPipelineStageId: string | null): Promise<{ stageId: string | null }> {
  let lostStageId: string | null = null;

  if (currentPipelineStageId) {
    const { data: currentStage, error: stageErr } = await supabase
      .from('sales_pipeline_stages')
      .select('pipeline_id')
      .eq('id', currentPipelineStageId)
      .single();
    if (stageErr) console.error('❌ Erro ao buscar stage atual:', stageErr);
    if (currentStage) {
      const { data: lostStage, error: lostErr } = await supabase
        .from('sales_pipeline_stages')
        .select('id')
        .eq('pipeline_id', currentStage.pipeline_id)
        .eq('is_lost', true)
        .limit(1)
        .maybeSingle();
      if (lostErr) console.error('❌ Erro ao buscar stage perdido:', lostErr);
      if (lostStage) lostStageId = lostStage.id;
    }
  }

  if (lostStageId) {
    // Get the pipeline of the lost stage
    const { data: lostPipelineStage } = await supabase
      .from('sales_pipeline_stages')
      .select('pipeline_id')
      .eq('id', lostStageId)
      .single();
    const lostPipelineId = lostPipelineStage?.pipeline_id;

    // Only update lead.pipeline_stage_id if lead is in this same pipeline
    const { data: leadCheck } = await supabase.from('leads').select('pipeline_stage_id').eq('id', leadId).single();
    if (leadCheck?.pipeline_stage_id) {
      const { data: leadStage } = await supabase.from('sales_pipeline_stages').select('pipeline_id').eq('id', leadCheck.pipeline_stage_id).single();
      if (leadStage?.pipeline_id === lostPipelineId) {
        const { error: leadErr } = await supabase
          .from('leads')
          .update({ pipeline_stage_id: lostStageId, sales_stage: 'perdido' })
          .eq('id', leadId);
        if (leadErr) console.error('❌ Erro ao mover lead para perdido:', leadErr);
      }
    }

    // Move only deals in THIS pipeline to lost
    const { error: dealErr } = await supabase
      .from('deals')
      .update({ pipeline_stage_id: lostStageId, status: 'lost', lost_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .eq('pipeline_id', lostPipelineId)
      .not('status', 'in', '("won","lost")');
    if (dealErr) console.error('❌ Erro ao mover deal para perdido:', dealErr);
  } else {
    // Fallback: mesmo sem stage, atualiza sales_stage
    console.warn('⚠️ Nenhum stage is_lost encontrado, atualizando sales_stage diretamente');
    await supabase.from('leads').update({ sales_stage: 'perdido' }).eq('id', leadId);
  }

  return { stageId: lostStageId };
}

/**
 * Executa uma tool/action
 */
async function executeTool(
  supabase: any,
  tool: AgentTool,
  args: Record<string, any>,
  lead: Lead,
  conversationId: string,
  agentId?: string,
  agentSettings?: AgentSettings
): Promise<{ success: boolean; result?: any; error?: string }> {
  console.log(`🔧 Executando tool: ${tool.name}`, args);

  try {
    switch (tool.action_type) {
      case 'qualify_bant': {
        const updates: any = {};
        if (args.budget) updates.bant_budget = true;
        if (args.authority) updates.bant_authority = true;
        if (args.need) updates.bant_need = true;
        if (args.timeline) updates.bant_timeline = true;

        // New qualification fields
        if (args.company_name) updates.company_name = args.company_name;
        if (args.employee_count) updates.employee_count = parseInt(String(args.employee_count), 10) || null;
        if (args.monthly_revenue) updates.monthly_revenue = String(args.monthly_revenue);
        if (args.challenges) updates.challenges = String(args.challenges);

        // Auto-set BANT booleans based on structured data
        if (args.monthly_revenue && !updates.bant_budget) updates.bant_budget = true;
        if (args.challenges && !updates.bant_need) updates.bant_need = true;

        // Atualizar contexto com informações coletadas
        let newContext = lead.context || '';
        if (args.budget) newContext += `\n[BANT] Budget: ${args.budget}`;
        if (args.authority) newContext += `\n[BANT] Authority: ${args.authority}`;
        if (args.need) newContext += `\n[BANT] Need: ${args.need}`;
        if (args.timeline) newContext += `\n[BANT] Timeline: ${args.timeline}`;
        if (args.company_name) newContext += `\n[QUAL] Empresa: ${args.company_name}`;
        if (args.employee_count) newContext += `\n[QUAL] Funcionários: ${args.employee_count}`;
        if (args.monthly_revenue) newContext += `\n[QUAL] Faturamento: ${args.monthly_revenue}`;
        if (args.challenges) newContext += `\n[QUAL] Desafios: ${args.challenges}`;
        updates.context = newContext;

        // Recalcular score
        let bantCount = 0;
        if (updates.bant_budget ?? lead.bant_budget) bantCount++;
        if (updates.bant_authority ?? lead.bant_authority) bantCount++;
        if (updates.bant_need ?? lead.bant_need) bantCount++;
        if (updates.bant_timeline ?? lead.bant_timeline) bantCount++;
        updates.sales_score = Math.min(100, (lead.sales_score || 50) + bantCount * 10);

        const { error } = await supabase
          .from('leads')
          .update(updates)
          .eq('id', lead.id);

        if (error) throw error;

        // Sync in-memory lead so subsequent tools (e.g. check_availability) see updated data
        Object.assign(lead, updates);

        // Auto-move pra "Qualificado" se tem os 3 dados essenciais preenchidos
        // (empresa + faturamento/funcionários + desafio) e ainda está em "Em Contato"
        const hasCompany = updates.company_name || lead.company_name;
        const hasSize = updates.employee_count || lead.employee_count || updates.monthly_revenue || lead.monthly_revenue;
        const hasChallenges = updates.challenges || lead.challenges;
        const currentStage = lead.pipeline_stage_name || '';

        if (hasCompany && hasSize && hasChallenges && currentStage === 'Em Contato') {
          console.log('📍 Lead qualificado (empresa + porte + desafio) → movendo para "Qualificado"');
          await moveLeadAndDealToStage(supabase, lead.id, lead.pipeline_stage_id, 'Qualificado');
        }

        return { success: true, result: { updated: Object.keys(updates) } };
      }

      case 'check_availability': {
        const targetDate = args.date; // YYYY-MM-DD
        if (!targetDate) {
          return { success: false, error: 'Data não informada' };
        }

        // GATE: Verificar qualificação mínima antes de permitir agendamento
        // Regra: nome da empresa obrigatório + faturamento mensal >= 30k
        // Challenges sozinho NÃO basta — precisamos de dados de porte (faturamento ou funcionários)
        // Porém se o lead insistir em agendar, priorizar agendamento
        const hasCompanyName = !!lead.company_name;
        const hasAnyQualData = !!(lead.employee_count || lead.monthly_revenue || lead.challenges || (lead.context && lead.context.length > 20));

        if (!hasCompanyName && !hasAnyQualData) {
          // Sem NENHUM dado — pedir empresa uma vez, mas liberar na próxima
          const gateKey = `_check_avail_gate_rejections`;
          lead[gateKey] = (lead[gateKey] || 0) + 1;
          if (lead[gateKey] <= 1) {
            return {
              success: false,
              error: `[INTERNAL - NÃO FALE ISSO PRO LEAD] Sem dados do lead. Chame qualify_lead com company_name e qualquer info que o lead já tenha mencionado (faturamento, desafios, etc). Depois chame check_availability novamente. Se o lead insistir em agendar sem dar dados, AGENDE mesmo assim — use qualify_lead com company_name='Não informado' pra liberar.`
            };
          }
          // 2ª tentativa — liberar sem dados
          console.log(`⚠️ Gate de qualificação liberado na 2ª tentativa — priorizando agendamento`);
        }

        // GATE: Faturamento mínimo de 30k para agendar reunião
        const MIN_REVENUE_FOR_MEETING = 30000;
        const hasRevenue = !!lead.monthly_revenue;
        if (hasRevenue) {
          // Parse revenue — suporta ranges como "20k-24k" (pega o primeiro valor)
          const rawRevenue = String(lead.monthly_revenue).toLowerCase();
          // Extrair primeiro número com possível sufixo k/mil (ex: "20k-24k" → "20k", "150mil" → "150mil")
          const firstMatch = rawRevenue.match(/(\d+[.,]?\d*)\s*(k|mil)?/);
          let revenueNum = 0;
          if (firstMatch) {
            const numPart = parseFloat(firstMatch[1].replace(',', '.')) || 0;
            const suffix = firstMatch[2];
            if (suffix === 'k' || suffix === 'mil') {
              revenueNum = numPart * 1000;
            } else {
              revenueNum = numPart;
            }
          }
          if (revenueNum > 0 && revenueNum < MIN_REVENUE_FOR_MEETING) {
            // Checar se já perguntamos sobre outras frentes de negócio
            // Busca no context do lead E no histórico de conversa (caso LLM não tenha salvo no context)
            const contextLower = (lead.context || '').toLowerCase();
            const challengesLower = (lead.challenges || '').toLowerCase();
            const alreadyAskedOtherBiz = contextLower.includes('outras frentes') ||
                                          contextLower.includes('outro negócio') ||
                                          contextLower.includes('outros negócios') ||
                                          contextLower.includes('só a ') ||
                                          contextLower.includes('único negócio') ||
                                          challengesLower.includes('outras frentes');

            // Também checar no histórico de conversa recente (fallback se LLM não salvou no context)
            if (!alreadyAskedOtherBiz) {
              const { data: recentMsgs } = await supabase
                .from('whatsapp_messages')
                .select('content, is_from_me')
                .eq('lead_id', lead.id)
                .order('sent_at', { ascending: false })
                .limit(10);
              const conversationText = (recentMsgs || []).map((m: any) => (m.content || '').toLowerCase()).join(' ');
              const askedInConvo = conversationText.includes('outras frentes') ||
                                   conversationText.includes('outro negócio') ||
                                   conversationText.includes('único negócio') ||
                                   conversationText.includes('é o único que vc toca');

              if (!askedInConvo) {
                // Primeira vez: perguntar se tem outros negócios antes de descartar
                return {
                  success: false,
                  error: `[INTERNAL - NÃO FALE ISSO PRO LEAD] O faturamento informado (${lead.monthly_revenue}) está abaixo de R$30k/mês. MAS antes de descartar, PERGUNTE se esse é o único negócio que o lead toca hoje ou se tem outras frentes/serviços. Muita gente tem um negócio menor mas toca outros projetos paralelos que somam um faturamento muito maior. Faça a pergunta de forma natural e consultiva, tipo: "me conta uma coisa.. esse [negócio do lead] é o único que vc toca hoje ou tem outras frentes também?" — Se o lead responder que tem outros negócios, chame qualify_lead pra atualizar o faturamento total e tente check_availability novamente. IMPORTANTE: Antes de chamar check_availability de novo, chame qualify_lead com context contendo "perguntou sobre outras frentes" pra não repetir a pergunta.`
                };
              }
            }

            // Já perguntou e o faturamento total continua baixo
            // Não agendar, mas dar uma saída elegante pro lead
            // IMPORTANTE: não usar palavras que ativem o stripInternalThinking
            // (faturamento abaixo, abaixo do mínimo, desqualificação, etc)

            // Montar mensagem de saída diretamente — sem depender do LLM interpretar
            const leadFirstName = (lead.name || '').split(' ')[0].toLowerCase();
            const softDeclineMessage = `${leadFirstName}.. que legal que vc tá buscando isso, de verdade\n\nolha.. nosso programa envolve um investimento a partir de R$2.500/mês em parcelas\n\ncom IA, um funcionário faz o trabalho de vários.. mas pra isso se pagar rápido, faz mais sentido quando a empresa já tá num momento de faturamento mais alto\n\npelo que vc me contou, talvez não seja o timing ideal ainda.. mas quando a ${lead.company_name || 'empresa'} crescer mais, vai fazer MUITO sentido\n\nfico à disposição pra quando for o momento 🤙`;

            // Enviar direto sem passar pelo LLM — evita filtros e garante a mensagem
            return {
              success: true,
              result: {
                available: false,
                reason: 'low_revenue',
                direct_message: softDeclineMessage,
              }
            };
          }
        }

        // Find sales rep: from args, from lead's deals, or fallback
        let salesRepId = args.sales_rep_id;
        if (!salesRepId) {
          const { data: deal } = await supabase
            .from('deals')
            .select('sales_rep_id')
            .eq('lead_id', lead.id)
            .not('sales_rep_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (deal?.sales_rep_id) {
            salesRepId = deal.sales_rep_id;
          }
        }

        if (!salesRepId) {
          return { success: false, error: 'Nenhum vendedor associado ao lead' };
        }

        // Use Brasilia timezone (UTC-3) for day boundaries
        const startOfDayISO = `${targetDate}T00:00:00-03:00`;
        const endOfDayISO = `${targetDate}T23:59:59-03:00`;

        // Fetch all 4 sources in parallel: activities, team_member (name + working_hours + meeting_duration), blocks, google events
        const [activitiesRes, repRes, blocksRes, googleEventsRes] = await Promise.all([
          // 1. company_activities - apenas calls/meetings/onboarding ocupam agenda
          // follow_up, whatsapp, email, checkin, internal etc. NÃO bloqueiam horário
          supabase
            .from('company_activities')
            .select('name, scheduled_at, task_type, end_datetime')
            .eq('responsavel_id', salesRepId)
            .eq('completed', false)
            .in('task_type', ['call', 'meeting', 'onboarding'])
            .gte('scheduled_at', startOfDayISO)
            .lte('scheduled_at', endOfDayISO)
            .order('scheduled_at', { ascending: true }),
          // 2. team_member info
          supabase
            .from('team_members')
            .select('name, working_hours, meeting_duration_minutes, auth_user_id')
            .eq('id', salesRepId)
            .single(),
          // 3. calendar_blocks
          supabase
            .from('calendar_blocks')
            .select('title, block_type, start_datetime, end_datetime, recurrence_days, recurrence_start_time, recurrence_end_time')
            .eq('team_member_id', salesRepId)
            .eq('is_active', true)
            .or(`block_type.eq.recurring,and(block_type.eq.one_time,start_datetime.lte.${endOfDayISO},end_datetime.gte.${startOfDayISO})`),
          // 4. google calendar events (via auth_user_id lookup - done after)
          (async () => {
            const { data: tmData } = await supabase
              .from('team_members')
              .select('auth_user_id')
              .eq('id', salesRepId)
              .single();
            if (!tmData?.auth_user_id) return { data: [], error: null };
            return supabase
              .from('calendar_events')
              .select('title, start_datetime, end_datetime, status')
              .eq('team_member_id', tmData.auth_user_id)
              .neq('status', 'cancelled')
              .gte('end_datetime', startOfDayISO)
              .lte('start_datetime', endOfDayISO);
          })(),
        ]);

        if (activitiesRes.error) throw activitiesRes.error;
        const activities = activitiesRes.data || [];
        const rep = repRes.data;
        const calBlocks = blocksRes.data || [];
        const googleEvents = googleEventsRes.data || [];

        // Meeting duration: use team_member setting > agent setting > default 45
        const MEETING_DURATION = rep?.meeting_duration_minutes || agentSettings?.meeting_duration_minutes || 45;

        // Working hours for this day (from team_member or default 9-17)
        const targetDayOfWeek = new Date(`${targetDate}T12:00:00-03:00`).getDay();
        const workingHours = rep?.working_hours as Record<string, { start: string; end: string } | null> | null;
        const dayConfig = workingHours?.[String(targetDayOfWeek)];

        // If day is off (null), return empty
        if (workingHours && dayConfig === null) {
          return {
            success: true,
            result: {
              date: targetDate,
              sales_rep: rep?.name || 'Vendedor',
              meeting_duration_minutes: MEETING_DURATION,
              busy_slots: [],
              available_windows: [],
              free_slots: [],
              note: `${rep?.name || 'O vendedor'} não trabalha neste dia da semana. Sugira outro dia.`,
            },
          };
        }

        // Parse working hours range
        const whStartStr = dayConfig?.start || '09:00';
        const whEndStr = dayConfig?.end || '17:00';
        const [whStartH, whStartM] = whStartStr.split(':').map(Number);
        const [whEndH, whEndM] = whEndStr.split(':').map(Number);
        const workStartMin = whStartH * 60 + whStartM;
        const workEndMin = whEndH * 60 + whEndM;

        // Converter atividades para intervalos ocupados em minutos desde meia-noite (horário Brasília)
        const busyIntervals: { startMin: number; endMin: number; time: string; activity: string; type: string }[] = [];
        for (const a of activities) {
          const dt = new Date(a.scheduled_at);
          const brasiliaHour = (dt.getUTCHours() - 3 + 24) % 24;
          const brasiliaMinute = dt.getUTCMinutes();
          const startMin = brasiliaHour * 60 + brasiliaMinute;
          // Use end_datetime if available, otherwise MEETING_DURATION
          let endMin = startMin + MEETING_DURATION;
          if (a.end_datetime) {
            const endDt = new Date(a.end_datetime);
            const endBrasiliaHour = (endDt.getUTCHours() - 3 + 24) % 24;
            const endBrasiliaMinute = endDt.getUTCMinutes();
            endMin = endBrasiliaHour * 60 + endBrasiliaMinute;
          }
          const time = `${String(brasiliaHour).padStart(2, '0')}:${String(brasiliaMinute).padStart(2, '0')}`;
          busyIntervals.push({ startMin, endMin, time, activity: a.name, type: a.task_type });
        }

        // Add calendar_blocks to busy intervals
        for (const block of calBlocks) {
          if (block.block_type === 'one_time' && block.start_datetime && block.end_datetime) {
            const s = new Date(block.start_datetime);
            const e = new Date(block.end_datetime);
            const sH = (s.getUTCHours() - 3 + 24) % 24;
            const sM = s.getUTCMinutes();
            const eH = (e.getUTCHours() - 3 + 24) % 24;
            const eM = e.getUTCMinutes();
            const time = `${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`;
            busyIntervals.push({ startMin: sH * 60 + sM, endMin: eH * 60 + eM, time, activity: `Bloqueio: ${block.title}`, type: 'block' });
          }
          if (block.block_type === 'recurring' && block.recurrence_days?.includes(targetDayOfWeek) && block.recurrence_start_time && block.recurrence_end_time) {
            const [rsH, rsM] = block.recurrence_start_time.split(':').map(Number);
            const [reH, reM] = block.recurrence_end_time.split(':').map(Number);
            const time = `${String(rsH).padStart(2, '0')}:${String(rsM).padStart(2, '0')}`;
            busyIntervals.push({ startMin: rsH * 60 + rsM, endMin: reH * 60 + reM, time, activity: `Bloqueio: ${block.title}`, type: 'block' });
          }
        }

        // Add Google Calendar events to busy intervals
        for (const evt of googleEvents) {
          const s = new Date(evt.start_datetime);
          const e = new Date(evt.end_datetime);
          const sH = (s.getUTCHours() - 3 + 24) % 24;
          const sM = s.getUTCMinutes();
          const eH = (e.getUTCHours() - 3 + 24) % 24;
          const eM = e.getUTCMinutes();
          const time = `${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`;
          busyIntervals.push({ startMin: sH * 60 + sM, endMin: eH * 60 + eM, time, activity: `Google: ${evt.title}`, type: 'google' });
        }

        const busySlots = busyIntervals.map(b => ({ time: b.time, activity: b.activity, type: b.type }));

        // Gerar slots disponíveis de 15 em 15 min dentro do horário de trabalho
        const freeSlots: string[] = [];
        for (let min = workStartMin; min <= workEndMin - MEETING_DURATION; min += 15) {
          const slotEnd = min + MEETING_DURATION;
          const hasConflict = busyIntervals.some(b => min < b.endMin && slotEnd > b.startMin);
          if (!hasConflict) {
            const h = Math.floor(min / 60);
            const m = min % 60;
            freeSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
          }
        }

        // Agrupar slots contíguos em janelas
        const availableWindows: { start: string; end: string; slots: string[] }[] = [];
        let currentWindow: string[] = [];
        for (let i = 0; i < freeSlots.length; i++) {
          if (currentWindow.length === 0) {
            currentWindow.push(freeSlots[i]);
          } else {
            const prevParts = currentWindow[currentWindow.length - 1].split(':');
            const currParts = freeSlots[i].split(':');
            const prevMin = parseInt(prevParts[0]) * 60 + parseInt(prevParts[1]);
            const currMin = parseInt(currParts[0]) * 60 + parseInt(currParts[1]);
            if (currMin - prevMin === 15) {
              currentWindow.push(freeSlots[i]);
            } else {
              availableWindows.push({
                start: currentWindow[0],
                end: currentWindow[currentWindow.length - 1],
                slots: [...currentWindow],
              });
              currentWindow = [freeSlots[i]];
            }
          }
        }
        if (currentWindow.length > 0) {
          availableWindows.push({
            start: currentWindow[0],
            end: currentWindow[currentWindow.length - 1],
            slots: [...currentWindow],
          });
        }

        // Auto-move para "Em Agendamento" (se ainda não está em Call Agendada ou adiante)
        const EM_AGENDAMENTO_STAGE = '2a2ce8f8-557c-42e2-98a2-f45ecd23b69d';
        const CALL_AGENDADA_STAGE = '11111111-0001-0001-0001-000000000004';
        const stagesAfterAgendamento = [
          CALL_AGENDADA_STAGE,
          '11111111-0001-0001-0001-000000000005', // No-show
          '11111111-0001-0001-0001-000000000006', // Call Realizada
          '11111111-0001-0001-0001-000000000007', // Em Fechamento
          '11111111-0001-0001-0001-000000000008', // Ganho
          '11111111-0001-0001-0001-000000000009', // Perdido
        ];
        if (!stagesAfterAgendamento.includes(lead.pipeline_stage_id) && lead.pipeline_stage_id !== EM_AGENDAMENTO_STAGE) {
          await moveLeadAndDealToStage(supabase, lead.id, lead.pipeline_stage_id, 'Em Agendamento');
          console.log(`📋 Lead ${lead.name} movido para "Em Agendamento" (check_availability)`);
        }

        return {
          success: true,
          result: {
            date: targetDate,
            sales_rep: rep?.name || 'Vendedor',
            meeting_duration_minutes: MEETING_DURATION,
            working_hours: `${whStartStr}-${whEndStr}`,
            busy_slots: busySlots,
            available_windows: availableWindows,
            free_slots: freeSlots,
            note: `Cada reunião dura ${MEETING_DURATION} minutos. Horário de trabalho: ${whStartStr}-${whEndStr}. Os horários listados em free_slots são os horários disponíveis para agendar. Ofereça os que fizerem mais sentido pro lead. NUNCA ofereça horário que não esteja em free_slots.`,
          },
        };
      }

      case 'schedule_meeting': {
        // GATE: Se o agente passou email nos args, salvar no lead primeiro
        if (args.email && args.email.includes('@')) {
          await supabase
            .from('leads')
            .update({ email: args.email })
            .eq('id', lead.id);
          lead.email = args.email;
          console.log(`📧 Email salvo no lead: ${args.email}`);
        }

        // GATE: Exigir email antes de agendar — busca do banco como fallback
        if (!lead.email) {
          const { data: freshLead } = await supabase
            .from('leads')
            .select('email')
            .eq('id', lead.id)
            .maybeSingle();
          if (freshLead?.email) {
            lead.email = freshLead.email;
            console.log(`📧 Email encontrado no banco: ${freshLead.email}`);
          }
        }
        if (!lead.email) {
          return {
            success: false,
            error: 'PARE - Antes de agendar, peça o EMAIL do lead. Diga algo como "me passa seu email pra eu mandar o invite da call". Depois chame schedule_meeting novamente com o parâmetro email preenchido.',
          };
        }

        // Find sales rep for responsavel_id
        let meetingRepId: string | null = null;
        const { data: repDeal } = await supabase
          .from('deals')
          .select('sales_rep_id')
          .eq('lead_id', lead.id)
          .not('sales_rep_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (repDeal?.sales_rep_id) meetingRepId = repDeal.sales_rep_id;

        // Build scheduled_at with Brasilia timezone (UTC-3)
        const scheduledAt = args.preferred_date
          ? `${args.preferred_date}T${args.preferred_time || '10:00'}:00-03:00`
          : null;

        // GATE: Verificar conflito de horário
        if (scheduledAt && meetingRepId) {
          const meetingDur = agentSettings?.meeting_duration_minutes || 45;
          const MEETING_DURATION_MS = meetingDur * 60 * 1000;
          const proposedStart = new Date(scheduledAt).getTime();
          const proposedEnd = proposedStart + MEETING_DURATION_MS;

          const dayStart = `${args.preferred_date}T00:00:00-03:00`;
          const dayEnd = `${args.preferred_date}T23:59:59-03:00`;

          const { data: existingActivities } = await supabase
            .from('company_activities')
            .select('name, scheduled_at, task_type')
            .eq('responsavel_id', meetingRepId)
            .eq('completed', false)
            .in('task_type', ['call', 'meeting', 'onboarding'])
            .gte('scheduled_at', dayStart)
            .lte('scheduled_at', dayEnd);

          const conflicts = (existingActivities || []).filter((a: any) => {
            const aStart = new Date(a.scheduled_at).getTime();
            const aEnd = aStart + MEETING_DURATION_MS;
            return proposedStart < aEnd && proposedEnd > aStart;
          });

          if (conflicts.length > 0) {
            const conflictList = conflicts.map((c: any) => {
              const dt = new Date(c.scheduled_at);
              const h = (dt.getUTCHours() - 3 + 24) % 24;
              const m = dt.getUTCMinutes();
              return `${c.name} às ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }).join(', ');

            return {
              success: false,
              error: `[INTERNAL] CONFLITO DE HORÁRIO! Já existe: ${conflictList}. Chame check_availability para ver os horários livres e ofereça outro horário ao lead.`,
            };
          }
        }

        // Criar tarefa de reunião
        const { data, error } = await supabase
          .from('company_activities')
          .insert({
            name: `Reunião IA na Prática & ${(lead.name || '').trim().split(/\s+/)[0]}`,
            description: args.notes || `Reunião agendada via agente IA`,
            task_type: 'meeting',
            priority: 'high',
            scheduled_at: scheduledAt,
            lead_id: lead.id,
            responsavel_id: meetingRepId,
            team: 'comercial',
            metadata: {
              meeting_type: 'video',
              created_by_agent: true,
              conversation_id: conversationId,
              lead_email: lead.email,
            },
          })
          .select()
          .single();

        if (error) throw error;

        // Mover lead + deal para etapa configurável (default: "Call Agendada")
        const targetStageName = args.move_to_stage || 'Call Agendada';
        await moveLeadAndDealToStage(supabase, lead.id, lead.pipeline_stage_id, targetStageName);

        // Disparar notificação meeting_scheduled para grupo comercial
        try {
          const meetDate = scheduledAt ? new Date(scheduledAt) : null;
          const repName = meetingRepId
            ? (await supabase.from('team_members').select('name').eq('id', meetingRepId).single())?.data?.name
            : null;

          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-notification-event`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              event_type: 'meeting_scheduled',
              context: {
                cliente: lead.name || '-',
                cliente_empresa: lead.company_name || '-',
                cliente_email: lead.email || '-',
                cliente_telefone: lead.phone || '-',
                responsavel: repName || '-',
                agendado_por: 'Agente IA',
                meeting_data: meetDate ? meetDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-',
                meeting_hora: meetDate ? meetDate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '-',
                meeting_tipo: 'REUNIÃO (Video)',
                meeting_notas: (args.notes || '').slice(0, 200),
                meeting_source: 'ai_agent',
              },
            }),
          });
          console.log(`🔔 Notificação meeting_scheduled disparada para ${lead.name}`);
        } catch (notifErr) {
          console.error('⚠️ Erro ao disparar notificação de reunião:', notifErr);
        }

        // Enviar email de agendamento via Resend (com conteúdo personalizado por IA)
        if (lead.email) {
          try {
            // Buscar deal ativo para contexto
            let dealId: string | undefined;
            const { data: activeDeal } = await supabase
              .from('deals')
              .select('id')
              .eq('lead_id', lead.id)
              .in('status', ['open', 'negotiation'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (activeDeal) dealId = activeDeal.id;

            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-meeting-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                lead_id: lead.id,
                email_type: 'scheduled',
                meeting_date: scheduledAt,
                meeting_duration_minutes: agentSettings?.meeting_duration_minutes || 45,
                specialist_id: meetingRepId,
                deal_id: dealId,
              }),
            });
            console.log(`📧 Email de agendamento enviado para ${lead.email}`);
          } catch (emailErr) {
            console.error('⚠️ Erro ao enviar email de agendamento:', emailErr);
          }
        }

        // Create Google Calendar event with Meet link
        if (meetingRepId && scheduledAt) {
          try {
            const startDt = new Date(scheduledAt);
            const meetDur = agentSettings?.meeting_duration_minutes || 45;
            const endDt = new Date(startDt.getTime() + meetDur * 60 * 1000);

            const calResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/create-calendar-event`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                team_member_id: meetingRepId,
                event: {
                  summary: `Reunião IA na Prática & ${(lead.name || '').trim().split(/\s+/)[0]}`,
                  startDateTime: startDt.toISOString(),
                  endDateTime: endDt.toISOString(),
                  attendees: lead.email ? [lead.email] : [],
                },
              }),
            });

            const calResult = await calResponse.json();
            if (calResult.success && calResult.eventId) {
              // Update task with Google event ID and Meet link
              await supabase
                .from('company_activities')
                .update({
                  google_event_id: calResult.eventId,
                  meeting_link: calResult.meetLink || null,
                  google_calendar_synced: true,
                })
                .eq('id', data.id);
              console.log(`📅 Google Calendar event created: ${calResult.eventId}, Meet: ${calResult.meetLink}`);
            }
          } catch (calErr) {
            console.error('⚠️ Error creating Google Calendar event:', calErr);
          }
        }

        return { success: true, result: { task_id: data.id, scheduled_for: scheduledAt, email: lead.email } };
      }

      case 'confirm_meeting': {
        // Buscar reunião pendente do lead
        const { data: meetingToConfirm } = await supabase
          .from('company_activities')
          .select('id, scheduled_at, name, metadata')
          .eq('lead_id', lead.id)
          .in('task_type', ['meeting', 'call'])
          .eq('completed', false)
          .order('scheduled_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!meetingToConfirm) {
          return { success: false, error: 'Nenhuma reunião/call pendente encontrada para este lead' };
        }

        const updatedMeta = {
          ...(meetingToConfirm.metadata || {}),
          confirmed_by_client: true,
          confirmed_at: new Date().toISOString(),
          confirmation_note: args.note || null,
        };

        await supabase
          .from('company_activities')
          .update({
            metadata: updatedMeta,
            status: 'confirmed',
            confirmed_by_client: true,
          })
          .eq('id', meetingToConfirm.id);

        // Disparar notificação de confirmação no grupo comercial
        try {
          const meetDate = meetingToConfirm.scheduled_at ? new Date(meetingToConfirm.scheduled_at) : null;
          const meetDateStr = meetDate ? meetDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
          const meetHoraStr = meetDate ? meetDate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '-';

          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-notification-event`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              event_type: 'meeting_confirmed',
              context: {
                cliente: lead.name || '-',
                cliente_empresa: lead.company_name || '-',
                meeting_data: meetDateStr,
                meeting_hora: meetHoraStr,
              },
            }),
          });
          console.log(`🔔 Notificação meeting_confirmed disparada para ${lead.name}`);
        } catch (notifErr) {
          console.error('⚠️ Erro ao disparar notificação de confirmação:', notifErr);
        }

        console.log(`✅ Meeting ${meetingToConfirm.id} confirmado pelo lead ${lead.name} — status: confirmed`);
        return {
          success: true,
          result: {
            confirmed: true,
            meeting_id: meetingToConfirm.id,
            scheduled_at: meetingToConfirm.scheduled_at,
            name: meetingToConfirm.name,
          },
        };
      }

      case 'confirm_webinar': {
        // Confirmar inscrição do lead no webinário semanal (terça 20h BRT)
        // Calcula a próxima terça-feira e cria enrollments com datas absolutas para lembretes

        // Calcular próxima terça-feira 20h BRT (UTC-3 = 23h UTC)
        const now = new Date();
        const currentDay = now.getUTCDay(); // 0=dom, 1=seg, 2=ter, ...
        // Dias até próxima terça: se hoje é terça e já passou das 23h UTC, vai pra próxima semana
        let daysUntilTuesday = (2 - currentDay + 7) % 7;
        if (daysUntilTuesday === 0) {
          // Hoje é terça — verificar se já passou das 23h UTC (20h BRT)
          if (now.getUTCHours() >= 23) {
            daysUntilTuesday = 7; // próxima terça
          }
        }
        if (daysUntilTuesday === 0) daysUntilTuesday = 7; // se é terça antes das 20h, ainda dá mas por segurança pega a próxima

        const nextTuesday = new Date(now);
        nextTuesday.setUTCDate(now.getUTCDate() + daysUntilTuesday);
        nextTuesday.setUTCHours(23, 0, 0, 0); // 20h BRT = 23h UTC

        // Segunda antes do webinário, 13h UTC (10h BRT) — lembrete D-1
        const mondayReminder = new Date(nextTuesday);
        mondayReminder.setUTCDate(nextTuesday.getUTCDate() - 1);
        mondayReminder.setUTCHours(13, 0, 0, 0);

        // Terça 22h UTC (19h BRT) — 1h antes
        const oneHourBefore = new Date(nextTuesday);
        oneHourBefore.setUTCHours(22, 0, 0, 0);

        // Terça 23h UTC (20h BRT) — link do webinário
        const webinarTime = nextTuesday;

        const webinarDateStr = nextTuesday.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' });

        // 1. Mover lead para estágio "Inscrito"
        await moveLeadAndDealToStage(supabase, lead.id, lead.pipeline_stage_id, 'Inscrito');

        // 2. Buscar o agente atual (para o agent_id nos enrollments)
        // O agente é passado via contexto do executeTool — vamos usar o agent_id da conversa
        const { data: currentConv } = await supabase
          .from('ai_agent_conversations')
          .select('agent_id')
          .eq('lead_id', lead.id)
          .in('status', ['active', 'paused_by_human', 'paused_by_schedule'])
          .limit(1)
          .maybeSingle();

        const webinarAgentId = currentConv?.agent_id;

        if (!webinarAgentId) {
          return { success: false, error: 'Conversa ativa não encontrada para criar enrollments' };
        }

        // 3. Criar 3 enrollments com datas absolutas (lembrete D-1, 1h antes, link)
        const enrollmentBase = {
          lead_id: lead.id,
          agent_id: webinarAgentId,
          stage: 'Inscrito',
          status: 'active',
          enrolled_at: new Date().toISOString(),
          metadata: { webinar_date: nextTuesday.toISOString(), type: 'webinar_reminder' },
        };

        // Step 0: Lembrete D-1 (segunda 10h BRT)
        await supabase.from('ai_agent_cadence_enrollments').insert({
          ...enrollmentBase,
          current_step: 0,
          next_action_at: mondayReminder.toISOString(),
        });

        // Step 1: "começa em 1h" (terça 19h BRT)
        await supabase.from('ai_agent_cadence_enrollments').insert({
          ...enrollmentBase,
          current_step: 1,
          next_action_at: oneHourBefore.toISOString(),
        });

        // Step 2: Link do webinário (terça 20h BRT) — este tem post_action move_stage
        await supabase.from('ai_agent_cadence_enrollments').insert({
          ...enrollmentBase,
          current_step: 2,
          next_action_at: webinarTime.toISOString(),
        });

        // 4. Disparar notificação
        try {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-notification-event`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              event_type: 'webinar_registered',
              context: {
                cliente: lead.name || '-',
                cliente_telefone: lead.phone || '-',
                cliente_empresa: lead.company_name || '-',
                webinar_data: webinarDateStr,
              },
            }),
          });
          console.log(`🔔 Notificação webinar_registered disparada para ${lead.name}`);
        } catch (notifErr) {
          console.error('⚠️ Erro ao disparar notificação de webinário:', notifErr);
        }

        console.log(`✅ Lead ${lead.name} inscrito no webinário de ${webinarDateStr} — 3 enrollments criados`);
        return {
          success: true,
          result: {
            webinar_date: nextTuesday.toISOString(),
            webinar_date_formatted: webinarDateStr,
            reminders_scheduled: [
              { step: 0, at: mondayReminder.toISOString(), description: 'Lembrete D-1' },
              { step: 1, at: oneHourBefore.toISOString(), description: '1h antes' },
              { step: 2, at: webinarTime.toISOString(), description: 'Link do webinário' },
            ],
          },
        };
      }

      case 'reschedule_meeting': {
        // Buscar reunião ativa mais recente do lead
        const { data: existingMeeting } = await supabase
          .from('company_activities')
          .select('id, scheduled_at, description, metadata, google_event_id, responsavel_id, name')
          .eq('lead_id', lead.id)
          .eq('task_type', 'meeting')
          .eq('completed', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existingMeeting) {
          return { success: false, error: 'Nenhuma reunião pendente encontrada para este lead' };
        }

        if (args.action === 'cancel') {
          // Cancelar a reunião
          await supabase
            .from('company_activities')
            .update({ completed: true, metadata: { cancelled: true, cancel_reason: args.reason || 'Cancelado pelo lead' } })
            .eq('id', existingMeeting.id);

          // Mover lead + deal de volta para "Em Contato" (ou estágio configurável)
          const backStageName = args.move_to_stage || 'Em Contato';
          await moveLeadAndDealToStage(supabase, lead.id, lead.pipeline_stage_id, backStageName);

          return { success: true, result: { cancelled: true, reason: args.reason } };
        }

        // Reagendar
        const newScheduledAt = args.new_date
          ? `${args.new_date}T${args.new_time || '10:00'}:00-03:00`
          : null;

        if (!newScheduledAt) {
          return { success: false, error: 'new_date é obrigatório para reagendamento' };
        }

        // Reset reminder flags so reminders fire again for the new date
        const existingMetadata = existingMeeting.metadata || {};
        const resetMetadata = { ...existingMetadata };
        delete resetMetadata.reminder_today_sent;
        delete resetMetadata.reminder_30min_sent;
        delete resetMetadata.reminder_24h_sent;
        delete resetMetadata.reminder_warmup_days;
        delete resetMetadata.noshow_sent;

        await supabase
          .from('company_activities')
          .update({
            scheduled_at: newScheduledAt,
            status: 'scheduled',
            completed: false,
            description: args.reason
              ? `${existingMeeting.description || ''} (reagendado: ${args.reason})`
              : existingMeeting.description,
            metadata: resetMetadata,
          })
          .eq('id', existingMeeting.id);

        // Sync rescheduled meeting to Google Calendar
        if (existingMeeting.google_event_id && existingMeeting.responsavel_id) {
          try {
            const startDt = new Date(newScheduledAt);
            const endDt = new Date(startDt.getTime() + (agentSettings?.meeting_duration_minutes || 45) * 60 * 1000);

            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/create-calendar-event`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                team_member_id: existingMeeting.responsavel_id,
                event_id: existingMeeting.google_event_id,
                event: {
                  summary: existingMeeting.name || `Reunião com ${lead.name}`,
                  startDateTime: startDt.toISOString(),
                  endDateTime: endDt.toISOString(),
                },
              }),
            });
            console.log(`📅 Google Calendar event updated for rescheduled meeting ${existingMeeting.id}`);
          } catch (calErr) {
            console.error('⚠️ Error updating Google Calendar event:', calErr);
          }
        }

        return { success: true, result: { rescheduled: true, new_date: newScheduledAt, old_date: existingMeeting.scheduled_at } };
      }

      case 'notify_human': {
        // Pausar conversa e notificar
        await supabase
          .from('ai_agent_conversations')
          .update({
            status: 'transferred',
            metadata: { transfer_reason: args.reason, urgency: args.urgency, transferred_at: new Date().toISOString() },
          })
          .eq('id', conversationId);

        // Buscar vendedor responsável (sales_rep_id do lead, ou fallback)
        let responsavelId: string | null = lead.sales_rep_id || null;
        if (!responsavelId) {
          // Fallback: buscar vendedor da equipe comercial
          const { data: defaultRep } = await supabase
            .from('team_members')
            .select('id')
            .eq('is_active', true)
            .eq('role', 'comercial')
            .limit(1)
            .maybeSingle();
          responsavelId = defaultRep?.id || null;
        }

        // Criar tarefa para humano COM data e responsável
        await supabase
          .from('company_activities')
          .insert({
            name: `Atender ${lead.name} - Transferido pelo agente`,
            description: `Motivo: ${args.reason}\nUrgência: ${args.urgency}`,
            task_type: 'whatsapp',
            priority: args.urgency === 'alta' ? 'urgent' : 'high',
            lead_id: lead.id,
            team: 'comercial',
            scheduled_at: new Date().toISOString(),
            responsavel_id: responsavelId,
            metadata: { source: 'ai_agent_transfer', ai_agent_reason: args.reason },
          });

        // Enviar notificação via WhatsApp (grupo + vendedor privado)
        try {
          const { data: carolInstance } = await supabase
            .from('whatsapp_instances')
            .select('id, name, api_url, api_key, phone_number')
            .eq('name', 'CAROL')
            .single();

          if (carolInstance?.api_key) {
            const urgencyEmoji = args.urgency === 'alta' ? '🚨' : '⚠️';
            const alertMsg = `${urgencyEmoji} *TRANSFERÊNCIA DO AGENTE IA*\n\n*Lead:* ${lead.name}\n*Telefone:* ${lead.phone}\n*Motivo:* ${args.reason}\n*Urgência:* ${args.urgency || 'normal'}\n\nO agente pausou a conversa. Assumam o atendimento.`;

            // Enviar para grupo TIME - IAP
            const groupJid = '120363421838905056@g.us';
            const carolIsEvolution = carolInstance.api_url && !carolInstance.api_url.includes('uazapi');
            const carolInstName = encodeURIComponent(carolInstance.name || '');
            await fetch(
              carolIsEvolution
                ? `${carolInstance.api_url}/message/sendText/${carolInstName}`
                : `${carolInstance.api_url}/send/text`,
              {
                method: 'POST',
                headers: carolIsEvolution
                  ? { 'Content-Type': 'application/json', 'apikey': carolInstance.api_key }
                  : { 'Content-Type': 'application/json', 'token': carolInstance.api_key },
                body: JSON.stringify({ number: groupJid, text: alertMsg }),
              }
            );

            // Enviar para vendedor responsável (privado)
            if (responsavelId) {
              const { data: repMember } = await supabase
                .from('team_members')
                .select('phone')
                .eq('id', responsavelId)
                .single();
              if (repMember?.phone) {
                const privateMsg = `${urgencyEmoji} *${lead.name}* precisa de atendimento AGORA.\n\nMotivo: ${args.reason}\n\nA IA pausou a conversa. Abra o inbox e responda.`;
                const repPhone = carolIsEvolution
                  ? repMember.phone.replace(/\D/g, '')
                  : `${repMember.phone}@s.whatsapp.net`;
                await fetch(
                  carolIsEvolution
                    ? `${carolInstance.api_url}/message/sendText/${carolInstName}`
                    : `${carolInstance.api_url}/send/text`,
                  {
                    method: 'POST',
                    headers: carolIsEvolution
                      ? { 'Content-Type': 'application/json', 'apikey': carolInstance.api_key }
                      : { 'Content-Type': 'application/json', 'token': carolInstance.api_key },
                    body: JSON.stringify({ number: repPhone, text: privateMsg }),
                  }
                );
              }
            }
          }
        } catch (notifyErr: any) {
          console.error('⚠️ Erro ao enviar notificação de transferência:', notifyErr.message);
        }

        // Disparar evento de notificação (sistema de notification_rules)
        try {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-notification-event`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              event_type: 'lead_hot',
              context: {
                cliente: lead.name || '-',
                cliente_telefone: lead.phone || '-',
                cliente_empresa: lead.company_name || '-',
                lead_context: `Transferido pela IA: ${args.reason}`,
              },
            }),
          });
        } catch (eventErr: any) {
          console.error('⚠️ Erro ao disparar notification event:', eventErr.message);
        }

        return { success: true, result: { transferred: true, reason: args.reason } };
      }

      case 'change_stage': {
        await moveLeadAndDealToStage(supabase, lead.id, lead.pipeline_stage_id, args.new_stage);
        return { success: true, result: { new_stage: args.new_stage } };
      }

      case 'query_products': {
        let query = supabase
          .from('products')
          .select('id, name, price, description')
          .eq('is_active', true);

        if (args.category) {
          query = query.ilike('category', `%${args.category}%`);
        }
        if (args.search) {
          query = query.ilike('name', `%${args.search}%`);
        }

        const { data, error } = await query.limit(5);
        if (error) throw error;

        return { success: true, result: { products: data } };
      }

      case 'update_lead': {
        const updates: any = {};
        if (args.name) updates.name = args.name;
        if (args.email) updates.email = args.email;
        if (args.company_name) updates.company_name = args.company_name;
        if (args.employee_count) updates.employee_count = parseInt(String(args.employee_count), 10) || null;
        if (args.monthly_revenue) updates.monthly_revenue = String(args.monthly_revenue);
        if (args.challenges) updates.challenges = String(args.challenges);
        if (args.context) {
          updates.context = (lead.context || '') + '\n' + args.context;
        }

        const { error } = await supabase
          .from('leads')
          .update(updates)
          .eq('id', lead.id);

        if (error) throw error;

        // Sync in-memory lead so subsequent tools see updated data
        Object.assign(lead, updates);

        return { success: true, result: { updated: Object.keys(updates) } };
      }

      case 'mark_lost': {
        const reason = args.reason || 'Não informado';

        // Atualizar lead com motivo de perda
        await supabase
          .from('leads')
          .update({ lost_reason: reason, lost_at: new Date().toISOString() })
          .eq('id', lead.id);

        // Mover lead + deal para "Perdido"
        await moveLeadAndDealToLost(supabase, lead.id, lead.pipeline_stage_id);

        // Encerrar conversa do agente
        await supabase
          .from('ai_agent_conversations')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('lead_id', lead.id)
          .in('status', ['active', 'paused_by_human', 'paused_by_schedule']);

        // Cancelar enrollments ativos
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('lead_id', lead.id)
          .in('status', ['active', 'paused', 'replied']);

        console.log(`❌ Lead marcado como Perdido: ${reason}`);

        return { success: true, result: { lost_reason: reason } };
      }

      case 'schedule_followup': {
        const scheduledAt = args.scheduled_at;
        const contextNote = args.context_note || '';

        if (!scheduledAt) {
          return { success: false, error: 'scheduled_at é obrigatório' };
        }

        // Get conversation ID
        const { data: fuConv } = await supabase
          .from('ai_agent_conversations')
          .select('id')
          .eq('lead_id', lead.id)
          .in('status', ['active', 'paused_by_schedule'])
          .limit(1)
          .maybeSingle();

        // Cancel any existing pending followups for this lead
        await supabase
          .from('ai_agent_scheduled_followups')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('lead_id', lead.id)
          .eq('status', 'pending');

        // Create new followup
        const { error: fuError } = await supabase
          .from('ai_agent_scheduled_followups')
          .insert({
            lead_id: lead.id,
            conversation_id: fuConv?.id || null,
            agent_id: agentId || null,
            scheduled_at: scheduledAt,
            context_note: contextNote,
            status: 'pending',
          });

        if (fuError) throw fuError;

        console.log(`📅 Follow-up agendado para ${scheduledAt}: ${contextNote}`);
        return { success: true, result: { scheduled_at: scheduledAt, context: contextNote } };
      }

      case 'send_whatsapp': {
        // Buscar instância do lead (mesma lógica do envio de resposta)
        const { data: lastMsg } = await supabase
          .from('whatsapp_messages')
          .select('instance_id')
          .eq('lead_id', lead.id)
          .is('group_id', null)
          .order('sent_at', { ascending: false })
          .limit(1)
          .single();

        if (!lastMsg?.instance_id) {
          return { success: false, error: 'Instancia nao encontrada' };
        }

        const { data: inst } = await supabase
          .from('whatsapp_instances')
          .select('id, api_key, api_url, metadata')
          .eq('id', lastMsg.instance_id)
          .eq('status', 'connected')
          .single();

        if (!inst) {
          return { success: false, error: 'Instancia desconectada' };
        }

        // Substituir variáveis na mensagem
        let msg = args.message || '';
        msg = msg.replace(/\{\{nome\}\}/g, lead.name || '');
        msg = msg.replace(/\{\{telefone\}\}/g, lead.phone || '');
        msg = msg.replace(/\{\{empresa\}\}/g, lead.company_name || '-');
        msg = msg.replace(/\{\{estagio\}\}/g, lead.pipeline_stage_name || lead.sales_stage || '-');
        msg = msg.replace(/\{\{score\}\}/g, String(lead.sales_score || 0));

        const target = args.target.includes('@') ? args.target : `${args.target}@s.whatsapp.net`;

        const sendResult = await sendWhatsAppMessage(inst, target, msg, false, supabase, lead.id);
        return { success: sendResult.ok, error: sendResult.error, result: { target, message_sent: msg } };
      }

      default:
        return { success: false, error: `Action type não suportado: ${tool.action_type}` };
    }
  } catch (error: any) {
    console.error(`❌ Erro na tool ${tool.name}:`, error);
    return { success: false, error: error.message };
  }
}

// ==================== MAIN PROCESSOR ====================

/**
 * Processa uma mensagem do lead
 */
async function processLeadMessage(
  supabase: any,
  queueItem: any,
  options?: { lockAlreadyHeld?: boolean }
): Promise<{ success: boolean; response?: string; error?: string }> {
  const { lead_id, conversation_id } = queueItem;
  let message_content = queueItem.message_content;
  const processingStartedAt = new Date().toISOString();
  const lockAlreadyHeld = options?.lockAlreadyHeld || false;
  let lockAcquiredHere = false;

  // UNIVERSAL LOCK: Prevenir processamento concorrente do mesmo lead
  // Se o caller já adquiriu o lock (ex: process_with_debounce), pula
  if (!lockAlreadyHeld) {
    const { data: lockAcquired } = await supabase.rpc('try_acquire_agent_lock', {
      p_lead_id: lead_id,
      p_lock_duration: '90 seconds',
    });
    if (!lockAcquired) {
      console.log(`🔒 processLeadMessage: Lock não adquirido para lead ${lead_id} — outra instância processando`);
      return { success: false, error: 'lock_not_acquired' };
    }
    lockAcquiredHere = true;
  }

  console.log(`📨 Processando mensagem para lead ${lead_id}${lockAcquiredHere ? ' (lock adquirido)' : ' (lock do caller)'}`);

  try {
  // 1. Buscar lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', lead_id)
    .single();

  if (leadError || !lead) {
    return { success: false, error: 'Lead não encontrado' };
  }

  // 1.5 Resolver telefone real do WhatsApp (corrige 9º dígito e divergências)
  lead.phone = await resolveLeadPhone(supabase, lead.id, lead.phone);

  // 2. Enriquecer lead com nome do estágio do pipeline
  await enrichLeadWithStageName(supabase, lead);

  // 2.1 GUARD: Lead já é cliente? Agente não responde — deixa humano lidar
  // Exceção: Webinário é gratuito, clientes participam normalmente
  // Checar agent_id da fila pra saber se é Webinário ANTES do agent matching
  let isWebinarPipeline = false;
  if (queueItem.agent_id) {
    const { data: preAgent } = await supabase.from('ai_sales_agents').select('pipeline_id').eq('id', queueItem.agent_id).maybeSingle();
    isWebinarPipeline = preAgent?.pipeline_id === '90b09d81-8282-4503-a869-1787baf8f736';
  }
  if (!isWebinarPipeline && await isLeadAlreadyClient(supabase, lead_id)) {
    console.log(`⏭️ Lead ${lead.name} já é cliente — agente não vai responder`);
    return { success: false, error: 'lead_is_client' };
  }

  // 2.2 GUARD: Número bloqueado (bot conhecido)?
  if (await isPhoneBlocked(supabase, lead.phone)) {
    console.log(`🚫 Lead ${lead.name} (${lead.phone}) — número bloqueado, agente não responde`);
    return { success: false, error: 'phone_blocked' };
  }

  // 2.3 GUARD: Detecção automática de bot (chatbot externo em loop)
  const botCheck = await detectBotConversation(supabase, lead_id, lead.phone);
  if (botCheck.isBot) {
    console.warn(`🤖 Bot detectado para ${lead.name} (score: ${botCheck.score}): ${botCheck.reasons.join(', ')}`);
    await blockPhoneAndPauseConversation(supabase, lead.phone, lead_id, botCheck.reasons, botCheck.score);
    return { success: false, error: 'bot_detected' };
  }

  // 2.4 GUARD: Estágios de fechamento — movido para DEPOIS do agent matching (seção 3.3)
  // Motivo: lead pode estar em múltiplos pipelines (ex: Closer "Em Fechamento" + Webinário "Em Contato")
  // O check precisa olhar o deal no pipeline DO AGENTE, não o stage global do lead

  // 2.5 Auto-move baseado em histórico de conversa
  // NOTA: movido para DEPOIS da seção 3 (agent matching) para filtrar por instance_id
  const shouldCheckAutoMove = (lead.pipeline_stage_name === 'Não atendeu' || lead.pipeline_stage_name === 'Novo');
  if (false) { // Desativado aqui — executado na seção 3.2
    const { count: inboundCount } = { count: 0 } as any;

    if (inboundCount && inboundCount > 0) {
      console.log(`📍 Lead em "${lead.pipeline_stage_name}" já tem ${inboundCount} msg(s) inbound → movendo para "Em Contato"`);
      await moveLeadAndDealToStage(supabase, lead.id, lead.pipeline_stage_id, 'Em Contato');
      lead.pipeline_stage_name = 'Em Contato';
    }
  }

  // 3. Buscar agente — prioridade: agent_id da fila > instance_id > stage
  const stageName = lead.pipeline_stage_name || 'Novo';
  let agent: any = null;
  let messageInstanceId: string | null = null;

  // 3.0 Se agent_id veio na fila (trigger já roteou), usar direto
  if (queueItem.agent_id) {
    const { data: queueAgent } = await supabase
      .from('ai_sales_agents')
      .select('*')
      .eq('id', queueItem.agent_id)
      .eq('is_active', true)
      .maybeSingle();
    if (queueAgent) {
      agent = queueAgent;
      messageInstanceId = agent.instance_id;
      console.log(`🎯 Agente da fila (agent_id): ${agent.name}`);
    }
  }

  // 3.1 Fallback: rotear por instance_id da última msg
  if (!agent) {
    const { data: lastLeadMsgForAgent } = await supabase
      .from('whatsapp_messages')
      .select('instance_id')
      .eq('lead_id', lead.id)
      .is('group_id', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    messageInstanceId = lastLeadMsgForAgent?.instance_id;

    if (messageInstanceId) {
      // Match por instance_id (sem depender do stage do lead)
      const { data: matchedAgent } = await supabase
        .from('ai_sales_agents')
        .select('*')
        .eq('is_active', true)
        .eq('instance_id', messageInstanceId)
        .limit(1)
        .maybeSingle();

      if (matchedAgent) {
        agent = matchedAgent;
        console.log(`🎯 Agente roteado por instance_id: ${agent.name}`);
      }
    }
  }

  // 3.2 Fallback: buscar por estágio (agentes sem instância)
  if (!agent) {
    const { data: matchedAgent } = await supabase
      .from('ai_sales_agents')
      .select('*')
      .eq('is_active', true)
      .contains('target_stages', [stageName])
      .limit(1)
      .maybeSingle();

    if (matchedAgent) {
      agent = matchedAgent;
      console.log(`⚠️ Agente por estágio: ${agent.name}`);
    }
  }

  // 3.3 Fallback: agente com target_stages vazio
  if (!agent) {
    const { data: fallbackAgent } = await supabase
      .from('ai_sales_agents')
      .select('*')
      .eq('is_active', true)
      .eq('target_stages', '{}')
      .limit(1)
      .maybeSingle();

    if (fallbackAgent) {
      console.log(`⚠️ Fallback geral: ${fallbackAgent.name || fallbackAgent.id}`);
      agent = fallbackAgent;
    }
  }

  if (!agent) {
    console.log(`⏭️ Nenhum agente ativo para estágio "${stageName}"`);
    return { success: false, error: 'Nenhum agente ativo' };
  }

  // 3.1 Filtrar por instância: se o agente tem instance_id configurada,
  // só processar mensagens que chegaram nessa instância
  if (agent.instance_id) {
    const { data: latestInbound } = await supabase
      .from('whatsapp_messages')
      .select('instance_id')
      .eq('lead_id', lead_id)
      .eq('is_from_me', false)
      .is('group_id', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestInbound && latestInbound.instance_id !== agent.instance_id) {
      console.log(`⏭️ Mensagem veio da instância ${latestInbound.instance_id}, agente configurado para ${agent.instance_id} — ignorando`);
      return { success: false, error: 'instance_mismatch' };
    }
  }

  // 3.2 Auto-move baseado em histórico (filtrado por instância do agente)
  if (shouldCheckAutoMove && agent.instance_id) {
    let autoMoveQuery = supabase
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', lead.id)
      .eq('is_from_me', false)
      .eq('instance_id', agent.instance_id)
      .is('group_id', null);
    const { count: inboundCount } = await autoMoveQuery;
    if (inboundCount && inboundCount > 0) {
      console.log(`📍 Lead em "${lead.pipeline_stage_name}" já tem ${inboundCount} msg(s) inbound na instância ${agent.instance_id} → movendo para "Em Contato"`);
      await moveLeadAndDealToStage(supabase, lead.id, lead.pipeline_stage_id, 'Em Contato');
      lead.pipeline_stage_name = 'Em Contato';
    }
  }

  // 3.3 GUARD: Estágios bloqueados — checar deal no pipeline DO AGENTE (não stage global do lead)
  const BLOCKED_STAGES = ['Em Fechamento', 'Call Realizada', 'Ganho', 'Perdido'];
  if (agent.pipeline_id) {
    const { data: agentDeal } = await supabase
      .from('deals')
      .select('pipeline_stage_id, stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(name)')
      .eq('lead_id', lead.id)
      .eq('pipeline_id', agent.pipeline_id)
      .in('status', ['open', 'negotiation'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const dealStageName = agentDeal?.stage?.name;
    if (dealStageName && BLOCKED_STAGES.includes(dealStageName)) {
      console.log(`🚫 Lead ${lead.name} em "${dealStageName}" no pipeline do agente ${agent.name} — bloqueado`);
      return { success: false, error: 'blocked_stage' };
    }
  } else {
    // Agente sem pipeline_id: fallback pro stage global do lead
    if (lead.pipeline_stage_name && BLOCKED_STAGES.includes(lead.pipeline_stage_name)) {
      console.log(`🚫 Lead ${lead.name} em estágio "${lead.pipeline_stage_name}" — agente não responde (estágio bloqueado)`);
      return { success: false, error: 'blocked_stage' };
    }
  }

  // Merge settings com defaults
  const settings = mergeSettings(agent.settings);

  // 3. Verificar horário de trabalho
  if (!isWithinWorkingHours(settings)) {
    const nextTime = getNextWorkingTime(settings);
    console.log(`⏭️ Fora do horário de trabalho — reagendar para ${nextTime}`);
    await supabase
      .from('ai_agent_conversations')
      .update({ status: 'paused_by_schedule' })
      .eq('id', conversation_id);
    // Logar evento pra mostrar no chat
    await supabase.rpc('log_ai_agent_event', {
      p_lead_id: lead_id,
      p_event_type: 'skipped',
      p_reason: 'out_of_hours',
      p_message: `Fora do horário comercial (${settings.working_hours_start}–${settings.working_hours_end}). Próxima janela: ${nextTime}`,
      p_agent_id: agent.id,
      p_conversation_id: conversation_id,
    });
    return { success: false, error: 'OUTSIDE_HOURS', reschedule_for: nextTime };
  }

  // 4. Handoff: completar conversas ativas de OUTROS agentes na mesma instância
  // Um lead só conversa com um agente por vez na mesma instância
  const { data: otherActiveConvos } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id')
    .eq('lead_id', lead_id)
    .eq('status', 'active')
    .neq('agent_id', agent.id);

  if (otherActiveConvos && otherActiveConvos.length > 0) {
    for (const conv of otherActiveConvos) {
      // Só completar se o outro agente usa a MESMA instância
      const { data: otherAgent } = await supabase
        .from('ai_sales_agents')
        .select('instance_id')
        .eq('id', conv.agent_id)
        .maybeSingle();

      if (otherAgent?.instance_id === agent.instance_id) {
        await supabase
          .from('ai_agent_conversations')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', conv.id);
        console.log(`🔄 Handoff: conversa ${conv.id} (agente ${conv.agent_id}) completada — ${agent.name} assumindo lead ${lead_id}`);
      }
    }
  }

  // 4b. Buscar ou criar conversa deste agente
  let conversation: ConversationState;
  if (conversation_id) {
    const { data } = await supabase
      .from('ai_agent_conversations')
      .select('*')
      .eq('id', conversation_id)
      .single();
    conversation = data;
  } else {
    const { data: existing } = await supabase
      .from('ai_agent_conversations')
      .select('*')
      .eq('lead_id', lead_id)
      .eq('agent_id', agent.id)
      .single();

    if (existing) {
      conversation = existing;
    } else {
      const { data: created } = await supabase
        .from('ai_agent_conversations')
        .insert({
          lead_id,
          agent_id: agent.id,
          status: 'active',
          messages_history: [],
        })
        .select()
        .single();
      conversation = created;
    }
  }

  // 5. Verificar se conversa está pausada
  // Auto-reativar conversas pausadas por horário se agora estamos em horário útil
  if (conversation.status === 'paused_by_schedule' && isWithinWorkingHours(settings)) {
    console.log(`🔄 Reativando conversa ${conversation.id} — estava paused_by_schedule mas agora estamos em horário útil`);
    await supabase
      .from('ai_agent_conversations')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', conversation.id);
    conversation.status = 'active';
  }

  // Auto-reativar conversas pausadas por humano se o cooldown já expirou
  if (conversation.status === 'paused_by_human' && conversation.paused_at) {
    const cooldownMinutes = settings.human_cooldown_minutes || 10;
    const pausedAt = new Date(conversation.paused_at).getTime();
    const cooldownExpired = Date.now() - pausedAt > cooldownMinutes * 60 * 1000;

    if (cooldownExpired) {
      console.log(`🔄 Reativando conversa ${conversation.id} — cooldown de humano expirou (${cooldownMinutes}min)`);
      await supabase
        .from('ai_agent_conversations')
        .update({ status: 'active', paused_by: null, pause_reason: null, paused_at: null, updated_at: new Date().toISOString() })
        .eq('id', conversation.id);
      conversation.status = 'active';
    }
  }

  if (conversation.status !== 'active') {
    console.log(`⏭️ Conversa não está ativa: ${conversation.status}`);
    return { success: false, error: `Conversa ${conversation.status}` };
  }

  // 5.1 GUARD: Detectar se um HUMANO (vendedor) mandou msg recente para este lead
  // Se sim, pausar o agente por X minutos para não interferir na conversa humana
  if (settings.auto_pause_after_human_reply) {
    const cooldownMinutes = settings.human_cooldown_minutes || 10;
    const cooldownCutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

    const { data: recentHumanOutbound } = await supabase
      .from('whatsapp_messages')
      .select('id, sent_at, content')
      .eq('lead_id', lead_id)
      .eq('is_from_me', true)
      .is('group_id', null)
      .gte('sent_at', cooldownCutoff)
      .not('metadata->>sent_by', 'eq', 'ai_agent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentHumanOutbound) {
      const minutesAgo = Math.round((Date.now() - new Date(recentHumanOutbound.sent_at).getTime()) / 60000);
      console.log(`🛑 GUARD: Humano mandou msg para lead ${lead.name} há ${minutesAgo}min (cooldown: ${cooldownMinutes}min) — agente NÃO vai responder`);

      // Pausar a conversa automaticamente
      await supabase
        .from('ai_agent_conversations')
        .update({
          status: 'paused_by_human',
          pause_reason: `Humano ativo — msg enviada há ${minutesAgo}min. Cooldown de ${cooldownMinutes}min.`,
          paused_at: new Date().toISOString(),
        })
        .eq('id', conversation.id);

      await supabase.rpc('log_ai_agent_event', {
        p_lead_id: lead_id,
        p_event_type: 'paused',
        p_reason: 'human_active_cooldown',
        p_message: `Vendedor mandou msg há ${minutesAgo}min — agente pausado por ${cooldownMinutes}min pra não atropelar.`,
        p_agent_id: agent.id,
        p_conversation_id: conversation.id,
      });
      return { success: false, error: 'human_active_cooldown' };
    }
  }

  // 6. Verificar limite de mensagens (configurável)
  if (conversation.total_messages_sent >= settings.max_messages_per_conversation) {
    console.log('⏭️ Limite de mensagens atingido');
    await supabase
      .from('ai_agent_conversations')
      .update({ status: 'completed' })
      .eq('id', conversation.id);
    await supabase.rpc('log_ai_agent_event', {
      p_lead_id: lead_id,
      p_event_type: 'paused',
      p_reason: 'max_messages_reached',
      p_message: `Limite de ${settings.max_messages_per_conversation} mensagens atingido. Conversa finalizada.`,
      p_agent_id: agent.id,
      p_conversation_id: conversation.id,
    });
    return { success: false, error: 'Limite de mensagens atingido' };
  }

  // 7. Buscar tools do agente
  const { data: tools } = await supabase
    .from('ai_agent_tools')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  // 7b. Buscar materiais de venda para o agente enviar mídias na conversa
  const { data: salesMaterials } = await supabase
    .from('sales_materials')
    .select('id, name, description, type, file_url, tags, usage_hint')
    .eq('is_active', true)
    .contains('tags', ['agente-ia'])
    .order('name');

  // 7c. Contar msgs seguidas do agente sem resposta do lead (SOMENTE da instância deste agente)
  // Agrupar msgs enviadas em <10s como UMA (splitMessageNaturally divide respostas em múltiplas msgs)
  let consecutiveAgentMsgs = 0;
  let recentContextQuery = supabase
    .from('whatsapp_messages')
    .select('is_from_me, message_type, sent_at')
    .eq('lead_id', lead_id)
    .is('group_id', null)
    .neq('message_type', 'ai_tool_call')
    .order('sent_at', { ascending: false })
    .limit(12);
  if (agent.instance_id) {
    recentContextQuery = recentContextQuery.eq('instance_id', agent.instance_id);
  }
  const { data: recentMsgsForContext } = await recentContextQuery;

  if (recentMsgsForContext) {
    let lastMsgTime: number | null = null;
    for (const msg of recentMsgsForContext) {
      if (msg.is_from_me) {
        const msgTime = new Date(msg.sent_at).getTime();
        // Msgs do agente enviadas com <10s de diferença = mesma resposta (split)
        if (lastMsgTime && (lastMsgTime - msgTime) < 10000) {
          // Faz parte do mesmo grupo, não incrementar
        } else {
          consecutiveAgentMsgs++;
        }
        lastMsgTime = msgTime;
      } else {
        break;
      }
    }
  }

  // Injetar aviso de contexto na mensagem se já mandou 2+ msgs sem resposta
  // (1 msg = resposta normal do agente, 2+ = re-tentativa ou follow-up)
  let enrichedMessage = message_content;
  if (consecutiveAgentMsgs >= 2) {
    enrichedMessage += `\n\n[CONTEXTO INTERNO - NÃO MENCIONE ISSO: Você já enviou ${consecutiveAgentMsgs} mensagem(ns) seguida(s) sem resposta do lead. CONDENSE tudo em UMA ÚNICA mensagem curta. NÃO envie mais de 1 mensagem agora.]`;
  }

  // 8. Chamar OpenAI com contexto completo
  let aiResponse: { message: string; toolCalls: any[] };
  try {
    aiResponse = await callOpenAIWithTools(
      supabase,
      agent,
      tools || [],
      lead,
      conversation.messages_history,
      enrichedMessage,
      salesMaterials || []
    );
  } catch (error: any) {
    console.error('❌ Erro ao chamar OpenAI:', error);
    // Logar erro
    await supabase.from('ai_agent_logs').insert({
      conversation_id: conversation.id,
      lead_id,
      agent_id: agent.id,
      log_type: 'error',
      data: { error: error.message, message: message_content },
    });
    return { success: false, error: error.message };
  }

  // 9. Executar tools em loop (suporta encadeamento: check_availability → schedule_meeting)
  // Máximo 3 iterações para evitar loops infinitos
  const MAX_TOOL_ITERATIONS = 3;
  let currentToolCalls = aiResponse.toolCalls;
  let allToolResults: any[] = [];
  let iteration = 0;

  while (currentToolCalls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
    iteration++;
    console.log(`🔧 Tool iteration ${iteration}/${MAX_TOOL_ITERATIONS}: ${currentToolCalls.length} tool(s)`);

    const iterationResults: any[] = [];
    for (const toolCall of currentToolCalls) {
      const tool = tools?.find((t: AgentTool) => t.name === toolCall.function.name);
      if (tool) {
        const args = JSON.parse(toolCall.function.arguments);
        console.log(`🔧 Executando tool: ${tool.name}`, args);
        const result = await executeTool(supabase, tool, args, lead, conversation.id, agent.id, settings);
        iterationResults.push({
          tool: tool.name,
          args,
          result,
          tool_call_id: toolCall.id,
        });

        // Logar tool call
        await supabase.from('ai_agent_logs').insert({
          conversation_id: conversation.id,
          lead_id,
          agent_id: agent.id,
          log_type: 'tool_called',
          data: { tool: tool.name, args },
        });

        await supabase.from('ai_agent_logs').insert({
          conversation_id: conversation.id,
          lead_id,
          agent_id: agent.id,
          log_type: 'tool_result',
          data: result,
        });

        // Inserir mensagem interna no WhatsApp chat para visibilidade do vendedor
        const toolLabel = getToolLabel(tool.name, tool.action_type);
        const argsDisplay = formatToolArgs(tool.action_type, args);
        const resultEmoji = result.success ? '✅' : '❌';
        const toolContent = `🔧 ${toolLabel}\n${argsDisplay}\n${resultEmoji} ${result.success ? 'Sucesso' : 'Erro: ' + (result.error || 'desconhecido')}`;

        // Usar instance_id configurada no agente, fallback para última mensagem do lead
        let toolInstanceId = agent.instance_id;
        if (!toolInstanceId) {
          const { data: lastMsgForTool } = await supabase
            .from('whatsapp_messages')
            .select('instance_id')
            .eq('lead_id', lead.id)
            .is('group_id', null)
            .order('sent_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          toolInstanceId = lastMsgForTool?.instance_id;
        }

        if (toolInstanceId) {
          await supabase.from('whatsapp_messages').insert({
            message_id: `tool_${toolCall.id}_${Date.now()}`,
            instance_id: toolInstanceId,
            lead_id: lead.id,
            content: toolContent,
            message_type: 'ai_tool_call',
            is_from_me: true,
            sent_at: new Date().toISOString(),
            metadata: {
              sent_by: 'ai_agent',
              agent_id: agent.id,
              agent_name: agent.name,
              tool_name: tool.name,
              tool_action: tool.action_type,
              tool_args: args,
              tool_success: result.success,
            },
          });
        }
      }
    }

    allToolResults = [...allToolResults, ...iterationResults];

    // Check: se algum tool retornou direct_message, enviar direto sem LLM
    const directMsgResult = iterationResults.find(r => r.result?.result?.direct_message);
    if (directMsgResult) {
      aiResponse.message = directMsgResult.result.result.direct_message;
      currentToolCalls = []; // Parar o loop de tools
      console.log(`📨 Direct message from tool (bypassing LLM): "${aiResponse.message.substring(0, 80)}..."`);
      break;
    }

    // Follow-up: enviar resultados das tools ao LLM e obter próxima resposta
    console.log(`🔄 Tool iteration ${iteration} concluída, fazendo follow-up ao LLM...`);
    try {
      const followUpResponse = await callOpenAIFollowUp(
        supabase, agent, tools || [], lead,
        conversation.messages_history, message_content,
        currentToolCalls, iterationResults,
        salesMaterials || []
      );
      if (followUpResponse.message) {
        aiResponse.message = followUpResponse.message;
      }
      // Se o follow-up retornou novas tool calls, continuar o loop
      currentToolCalls = followUpResponse.toolCalls || [];
      if (currentToolCalls.length > 0) {
        console.log(`🔗 Follow-up retornou ${currentToolCalls.length} nova(s) tool call(s), encadeando...`);
      }
    } catch (followUpError: any) {
      console.error(`❌ Erro no follow-up iteração ${iteration}:`, followUpError);
      currentToolCalls = []; // Parar o loop
    }
  }

  if (iteration >= MAX_TOOL_ITERATIONS && currentToolCalls.length > 0) {
    console.warn(`⚠️ Atingiu limite de ${MAX_TOOL_ITERATIONS} iterações de tools, parando encadeamento`);
  }

  const toolResults = allToolResults;

  // 10. Se houve tool de transferência, não enviar resposta automática
  const transferred = toolResults.some(r => r.tool === 'notify_sales_rep' || r.result?.transferred);
  if (transferred) {
    return { success: true, response: 'Transferido para humano' };
  }

  // 10b. Log de msgs seguidas (para diagnóstico, sem bloquear)
  if (consecutiveAgentMsgs >= 3) {
    console.warn(`⚠️ AVISO: ${consecutiveAgentMsgs} msgs seguidas do agente sem resposta do lead (lead_id: ${lead_id})`);
  }

  // 11. Buscar instância WhatsApp — REGRA: se agente tem instance_id, usa SOMENTE ela. Sem fallback.
  let targetInstanceId: string | null = agent.instance_id || null;
  let instanceSource = 'agent_config';

  if (!targetInstanceId) {
    // Só usa fallback se o agente NÃO tem instance_id configurada
    const { data: lastMessage } = await supabase
      .from('whatsapp_messages')
      .select('instance_id')
      .eq('lead_id', lead_id)
      .is('group_id', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    targetInstanceId = lastMessage?.instance_id || null;
    instanceSource = 'last_message';
  }

  if (!targetInstanceId) {
    return { success: false, error: 'Nenhuma instância WhatsApp configurada para o agente e nenhuma mensagem encontrada para este lead' };
  }

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('id, api_key, api_url, metadata')
    .eq('id', targetInstanceId)
    .single();

  if (!instance) {
    return { success: false, error: `Instância WhatsApp ${targetInstanceId} não encontrada` };
  }

  // Se é a instância do agente e está desconectada, NÃO enviar (sem fallback)
  if (agent.instance_id && instance.status === 'disconnected') {
    return { success: false, error: `Instância do agente ${targetInstanceId} desconectada — NÃO enviar por outra instância` };
  }

  console.log(`📱 Usando instância: ${instance.id} (source: ${instanceSource})`);

  // 11c. SAFETY NET: Se IA retornou resposta vazia (sem texto E sem tools), re-gerar com nudge
  // Isso acontece quando o LLM decide "ouvir mais" ou retorna end_turn sem content
  if (!aiResponse.message?.trim() && toolResults.length === 0) {
    console.warn(`⚠️ IA retornou resposta vazia para ${lead.name}, re-gerando com nudge...`);
    try {
      const nudgeResponse = await callLLMSimple(
        agent.model,
        'Você é um vendedor conversando com um lead via WhatsApp. Responda de forma natural e breve.',
        [{ role: 'user', content: `O lead disse: "${message_content}"\n\nResponda de forma natural, continuando a conversa. Não fique em silêncio.` }],
        agent.temperature || 0.7,
        500,
      );
      if (nudgeResponse?.trim()) {
        aiResponse.message = nudgeResponse.trim();
        console.log(`✅ Re-geração com nudge OK: "${aiResponse.message.substring(0, 80)}..."`);
      }
    } catch (nudgeErr: any) {
      console.error('❌ Erro no nudge re-gen:', nudgeErr?.message);
    }
  }

  // 12. Verificar se IA incluiu tag [MEDIA:X] na resposta
  let responseMessage = aiResponse.message || settings.fallback_message;

  // Safety: fallback_message pode ser espaço/vazio — tratar como vazio
  if (!responseMessage?.trim()) {
    responseMessage = '';
  }
  let mediaSentInfo: string | null = null;

  const mediaTagMatch = responseMessage.match(/\[MEDIA:(\d+)\]/);
  if (mediaTagMatch && salesMaterials && salesMaterials.length > 0) {
    const mediaIndex = parseInt(mediaTagMatch[1], 10);
    if (mediaIndex >= 0 && mediaIndex < salesMaterials.length) {
      const chosenMaterial = salesMaterials[mediaIndex];
      console.log(`🎯 IA escolheu enviar material na conversa: ${chosenMaterial.name} (${chosenMaterial.type})`);

      // Remover a tag da mensagem de texto (em qualquer posição)
      responseMessage = responseMessage.replace(/\[MEDIA:\d+\]\s*\n?/, '').trim();

      // Enviar mídia primeiro
      let mediaSent = false;
      const captionForMedia = responseMessage.length <= 200 ? responseMessage : undefined;

      switch (chosenMaterial.type) {
        case 'image':
          mediaSent = await sendWhatsAppImage(instance, lead.phone, chosenMaterial.file_url, captionForMedia);
          break;
        case 'video':
          mediaSent = await sendWhatsAppVideo(instance, lead.phone, chosenMaterial.file_url, captionForMedia);
          break;
        case 'audio':
          mediaSent = await sendWhatsAppAudio(instance, lead.phone, chosenMaterial.file_url);
          break;
        default:
          // document ou outro tipo → envia como link no texto
          responseMessage = `${responseMessage}\n\n${chosenMaterial.file_url}`;
          break;
      }

      if (mediaSent) {
        mediaSentInfo = `[ai_media: ${chosenMaterial.name}]`;
        console.log(`📤 Mídia enviada na conversa: ${chosenMaterial.name}`);
        // Se caption foi junto com a mídia, não precisa enviar texto separado
        if (captionForMedia) {
          responseMessage = '';
        }
        // Pequeno delay entre mídia e texto
        if (responseMessage) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } else {
        console.log(`⚠️ Falha ao enviar mídia, enviando só texto`);
      }
    } else {
      // Índice inválido - remover tag e enviar só texto
      responseMessage = responseMessage.replace(/\[MEDIA:\d+\]\s*\n?/, '').trim();
    }
  }

  // === 12a-CHECK: PRÉ-ENVIO - novas msgs chegaram durante processamento do OpenAI? ===
  // Se o lead mandou mais mensagens enquanto o OpenAI processava, re-geramos a resposta
  // para incluir o contexto completo (evita perguntar o que o lead já respondeu).
  if (responseMessage) {
    try {
      const { data: newMsgsWhileProcessing } = await supabase
        .from('whatsapp_messages')
        .select('content, created_at')
        .eq('lead_id', lead_id)
        .eq('is_from_me', false)
        .is('group_id', null)
        .gt('created_at', processingStartedAt)
        .order('created_at', { ascending: true });

      if (newMsgsWhileProcessing && newMsgsWhileProcessing.length > 0) {
        const newContent = newMsgsWhileProcessing.map((m: any) => m.content).filter(Boolean).join('\n');
        console.log(`🔄 CHECK PRÉ-ENVIO: ${newMsgsWhileProcessing.length} msg(s) novas durante processamento: "${newContent.substring(0, 100)}"`);

        const regenSystemPrompt = `Você é um vendedor casual da equipe do Frank Costa. O lead mandou mensagens adicionais ENQUANTO você processava a resposta anterior. Reescreva sua resposta para cobrir TUDO que o lead disse (original + novas). Regras:
- Tom casual de WhatsApp, curto (max 2-3 frases)
- NÃO repita perguntas que o lead já respondeu nas novas mensagens
- Se o lead já disse o que faz/quer, RECONHEÇA e avance a conversa
- Responda APENAS com a mensagem final, sem formatação extra`;

        const updatedResponse = await callLLMSimple(
          agent.model,
          regenSystemPrompt,
          [
            { role: "user", content: `Mensagem(ns) original(is) do lead:\n${message_content}` },
            { role: "assistant", content: responseMessage },
            { role: "user", content: `Mensagens ADICIONAIS do lead (enviadas agora):\n${newContent}` },
          ],
          agent.temperature,
          500,
        );

        if (updatedResponse) {
          console.log(`✅ Resposta re-gerada com novas msgs: "${updatedResponse.substring(0, 100)}"`);
          responseMessage = updatedResponse;
          message_content += `\n${newContent}`;
        }
      }
    } catch (regenErr: any) {
      console.error('⚠️ Erro re-gen pré-envio, usando resposta original:', regenErr?.message);
    }
  }

  // 12b. Enviar resposta de texto (se houver)
  const beforeSendTimestamp = new Date(Date.now() - 2000).toISOString(); // 2s margem
  let sendOk = true;
  let sendError: string | undefined;

  if (responseMessage) {
    // Safety: remover pensamento interno da IA (ex: "Analisando o histórico...")
    responseMessage = stripInternalThinking(responseMessage);

    // Safety: remover qualquer tag [MEDIA:X] residual antes de enviar
    responseMessage = responseMessage.replace(/\[MEDIA:\d+\]\s*\n?/g, '').trim();

    // Safety: se stripInternalThinking zerou a mensagem, re-gerar com nudge limpo
    if (!responseMessage) {
      console.warn(`⚠️ stripInternalThinking zerou a mensagem, re-gerando com nudge limpo...`);
      try {
        const cleanRetry = await callLLMSimple(
          agent.model,
          'Você é um vendedor conversando com um lead via WhatsApp. Responda de forma natural e breve. NÃO inclua raciocínio interno.',
          [{ role: 'user', content: `O lead disse: "${message_content}"\n\nResponda de forma natural, breve e direta. Apenas a mensagem pro lead.` }],
          agent.temperature || 0.7,
          300,
        );
        if (cleanRetry?.trim()) {
          responseMessage = stripInternalThinking(cleanRetry.trim());
          if (responseMessage) {
            console.log(`✅ Re-geração pós-strip OK: "${responseMessage.substring(0, 80)}..."`);
          }
        }
      } catch (retryErr: any) {
        console.error('❌ Erro re-gen pós-strip:', retryErr?.message);
      }
    }

    // Safety: bloquear URLs fabricadas pela IA (meet.google.com, zoom.us, etc.)
    // Permitir apenas URLs de sales_materials (file_url) que já foram validadas
    const urlPattern = /https?:\/\/[^\s]+/gi;
    const foundUrls = responseMessage.match(urlPattern) || [];
    for (const url of foundUrls) {
      // Permitir URLs do Supabase storage (materiais de venda)
      const isSafeUrl = url.includes('supabase.co/storage') || url.includes('supabase.co/functions');
      if (!isSafeUrl) {
        console.warn(`⚠️ BLOCKED: AI tried to send URL: ${url}`);
        responseMessage = responseMessage.replace(url, '[link removido]');
      }
    }

    // Delay inicial antes de responder
    const initialDelay = calculateResponseDelay(settings, responseMessage.length);
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    const sendResult = await sendHumanizedResponse(
      instance,
      lead.phone,
      responseMessage,
      settings,
      supabase,
      lead.id,
    );
    sendOk = sendResult.ok;
    sendError = sendResult.error;
  }

  // Log: se após todas as tentativas a resposta ainda está vazia, registrar
  if (!responseMessage && !mediaSentInfo) {
    console.error(`🚨 RESPOSTA VAZIA FINAL: lead=${lead.name} (${lead_id}), msg="${message_content.substring(0, 100)}". Nenhum texto enviado.`);
    await supabase.from('ai_agent_logs').insert({
      conversation_id: conversation.id,
      lead_id,
      agent_id: agent.id,
      log_type: 'error',
      data: { error: 'empty_response_after_retries', message: message_content.substring(0, 200) },
    });
  }

  if (!sendOk && !mediaSentInfo) {
    // Alertar no grupo se WhatsApp desconectou
    if (sendError && typeof sendError === 'string' && sendError.toLowerCase().includes('disconnected') && instance) {
      await notifyWhatsAppDisconnected(supabase, instance, sendError);
    }
    return { success: false, error: sendError || 'Falha ao enviar mensagem' };
  }

  // Marcar mensagens como enviadas pela IA (async, não bloqueia resposta)
  markRecentMessagesAsAI(supabase, lead_id, agent.id, agent.name, beforeSendTimestamp)
    .catch(err => console.error('Erro ao marcar msgs como AI:', err));

  // ================================================================
  // PONTO SEM RETORNO: mensagem já foi enviada via WhatsApp.
  // Operações pós-envio em try/catch isolados — falhas NÃO devem
  // fazer a função retornar success:false (msg JÁ FOI ENVIADA).
  // ================================================================
  const now = new Date().toISOString();
  const fullResponseForHistory = mediaSentInfo
    ? `${mediaSentInfo} ${responseMessage}`.trim()
    : responseMessage;

  // 13. Atualizar conversa (inclui tool calls no histórico para debug)
  try {
    const newHistoryEntries: any[] = [
      { role: 'user', content: message_content, timestamp: now },
    ];

    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        newHistoryEntries.push({
          role: 'tool_call',
          content: `🔧 ${tr.tool}(${JSON.stringify(tr.args)})`,
          result: tr.result?.success ? '✅' : '❌',
          timestamp: now,
          is_internal: true,
        });
      }
    }

    newHistoryEntries.push({
      role: 'assistant',
      content: fullResponseForHistory,
      timestamp: now,
      is_from_agent: true,
    });

    const updatedHistory = [
      ...conversation.messages_history,
      ...newHistoryEntries,
    ];

    await supabase
      .from('ai_agent_conversations')
      .update({
        messages_history: updatedHistory,
        total_messages_sent: conversation.total_messages_sent + 1,
        total_messages_received: conversation.total_messages_received + 1,
        last_processed_at: now,
      })
      .eq('id', conversation.id);
  } catch (histErr) {
    console.error(`⚠️ Erro ao atualizar conversation history (msg JÁ ENVIADA) para lead ${lead_id}:`, histErr);
  }

  // 14. Logar mensagens
  try {
    await supabase.from('ai_agent_logs').insert([
      {
        conversation_id: conversation.id,
        lead_id,
        agent_id: agent.id,
        log_type: 'message_received',
        data: { content: message_content },
      },
      {
        conversation_id: conversation.id,
        lead_id,
        agent_id: agent.id,
        log_type: 'message_sent',
        data: { content: fullResponseForHistory, media_sent: mediaSentInfo || undefined, tool_calls: aiResponse.toolCalls, tool_results: toolResults },
      },
    ]);
  } catch (logErr) {
    console.error(`⚠️ Erro ao inserir logs (msg JÁ ENVIADA) para lead ${lead_id}:`, logErr);
  }

  return { success: true, response: responseMessage };
  } catch (processError: any) {
    console.error(`❌ Erro em processLeadMessage para lead ${lead_id}:`, processError.message || processError);
    return { success: false, error: processError.message || 'Erro interno' };
  } finally {
    // SEMPRE liberar o lock se foi adquirido aqui
    if (lockAcquiredHere) {
      try { await supabase.rpc('release_agent_lock', { p_lead_id: lead_id }); } catch {}
      console.log(`🔓 processLeadMessage: Lock liberado para lead ${lead_id}`);
    }
  }
}

// ==================== QUEUE PROCESSOR ====================

/**
 * Processa itens da fila de mensagens.
 * Usa claiming atômico (FOR UPDATE SKIP LOCKED via RPC) para evitar processamento duplo.
 * Combina TODAS as mensagens pendentes do lead (não apenas a da fila) para contexto completo.
 */
async function processQueue(supabase: any): Promise<{ processed: number; errors: number }> {
  // Buscar configurações do agente ativo
  const { data: agent } = await supabase
    .from('ai_sales_agents')
    .select('settings')
    .eq('is_active', true)
    .limit(1)
    .single();

  const settings = mergeSettings(agent?.settings);

  // Claiming atômico: FOR UPDATE SKIP LOCKED garante que cada msg é processada uma única vez
  // mesmo com trigger + cron chamando simultaneamente
  const { data: queueItems, error } = await supabase.rpc('claim_queue_messages', {
    p_batch_size: settings.queue_batch_size,
  });

  if (error) {
    console.error('❌ Erro ao clamar fila:', error);
    return { processed: 0, errors: 1 };
  }

  if (!queueItems || queueItems.length === 0) {
    console.log('📭 Fila vazia');
    return { processed: 0, errors: 0 };
  }

  console.log(`📬 Processando ${queueItems.length} mensagens da fila`);

  let processed = 0;
  let errors = 0;
  const processedLeadIds = new Set<string>();

  for (const item of queueItems) {
    try {
      // === COMBINAR TODAS as mensagens pendentes do lead ===
      // (não apenas a msg da fila — o lead pode ter mandado várias msgs rápidas)
      const { data: lastAgentMsg } = await supabase
        .from('whatsapp_messages')
        .select('sent_at')
        .eq('lead_id', item.lead_id)
        .eq('is_from_me', true)
        .is('group_id', null)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      let messagesQuery = supabase
        .from('whatsapp_messages')
        .select('content, sent_at')
        .eq('lead_id', item.lead_id)
        .eq('is_from_me', false)
        .is('group_id', null)
        .order('sent_at', { ascending: true });

      if (lastAgentMsg?.sent_at) {
        messagesQuery = messagesQuery.gt('sent_at', lastAgentMsg.sent_at);
      }

      const { data: pendingMessages } = await messagesQuery;

      // ANTI-DUP: Se o agente já respondeu DEPOIS da msg original do queue item,
      // significa que process_with_debounce já processou → marcar como completed e pular
      if (lastAgentMsg?.sent_at && new Date(lastAgentMsg.sent_at) > new Date(item.created_at)) {
        console.log(`⏭️ Queue item ${item.id}: agente já respondeu (${lastAgentMsg.sent_at}) depois do item (${item.created_at}) — já processado por debounce`);
        await supabase
          .from('ai_agent_message_queue')
          .update({ status: 'completed', processed_at: new Date().toISOString(), result: { skipped: 'already_processed_by_debounce' } })
          .eq('id', item.id);
        continue;
      }

      // Combinar todas as mensagens em uma só (como process_with_debounce faz)
      let combinedMessage = item.message_content; // fallback: msg da fila
      if (pendingMessages && pendingMessages.length > 0) {
        combinedMessage = pendingMessages
          .map((m: any) => m.content)
          .filter((c: any) => c)
          .join('\n');
        if (pendingMessages.length > 1) {
          console.log(`📝 Combinando ${pendingMessages.length} mensagens do lead ${item.lead_id}`);
        }
      }

      // DEDUP no batch: se já processamos este lead neste ciclo, pular
      // (as msgs dele já foram incluídas no combine da primeira execução)
      if (processedLeadIds.has(item.lead_id)) {
        console.log(`⏭️ Lead ${item.lead_id} já processado neste batch — marcando como completed (msgs já combinadas)`);
        await supabase
          .from('ai_agent_message_queue')
          .update({ status: 'completed', processed_at: new Date().toISOString(), result: { skipped: 'already_processed_in_batch' } })
          .eq('id', item.id);
        continue;
      }

      const result = await processLeadMessage(supabase, {
        ...item,
        message_content: combinedMessage,
      });

      if (result.success) {
        processedLeadIds.add(item.lead_id);

        // Track reply in global send count (for monitoring, doesn't block)
        try {
          const inst = await getLeadWhatsAppInstance(supabase, item.lead_id);
          if (inst) await incrementSendCount(supabase, inst.id, 'reply');
        } catch (_) { /* non-critical */ }

        await supabase
          .from('ai_agent_message_queue')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            result: { response: result.response },
          })
          .eq('id', item.id);
        processed++;
      } else if (result.error === 'OUTSIDE_HOURS' && result.reschedule_for) {
        // Fora do horário → reagendar para o próximo horário comercial (NÃO contar como tentativa)
        console.log(`⏰ Reagendando item ${item.id} para ${result.reschedule_for}`);
        await supabase
          .from('ai_agent_message_queue')
          .update({
            status: 'pending',
            scheduled_for: result.reschedule_for,
            attempts: 0,
            error_message: `Reagendado: fora do horário → ${result.reschedule_for}`,
          })
          .eq('id', item.id);
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      console.error(`❌ Erro ao processar item ${item.id}:`, err);

      const newStatus = item.attempts >= settings.max_retry_attempts ? 'failed' : 'pending';
      await supabase
        .from('ai_agent_message_queue')
        .update({
          status: newStatus,
          error_message: err.message,
        })
        .eq('id', item.id);

      // Se falhou definitivamente, criar nota + msg de erro visível no chat
      if (newStatus === 'failed' && item.lead_id) {
        await supabase.from('cs_conversation_notes').insert({
          lead_id: item.lead_id,
          content: `⚠️ Agente IA falhou ao processar/enviar mensagem: ${err.message}`,
          note_type: 'warning',
          created_by: null,
        }).catch(() => {});

        // Inserir erro visível no chat pra vendedor ver
        const errorInstanceId = item.agent_id ? (await supabase.from('ai_sales_agents').select('instance_id, name').eq('id', item.agent_id).maybeSingle())?.data : null;
        if (errorInstanceId?.instance_id) {
          const shortError = err.message?.includes('credit balance') ? 'Créditos da API acabaram — recarregue em console.anthropic.com'
            : err.message?.includes('blocked_stage') ? 'Lead em etapa bloqueada para o agente'
            : err.message?.length > 100 ? err.message.substring(0, 100) + '...' : err.message;
          await supabase.from('whatsapp_messages').insert({
            instance_id: errorInstanceId.instance_id,
            message_id: `ai_error_${Date.now()}`,
            message_type: 'ai_system_error',
            content: `⚠️ ${shortError}`,
            is_from_me: true,
            sent_at: new Date().toISOString(),
            lead_id: item.lead_id,
            sender_name: errorInstanceId.name || 'Agente IA',
            metadata: { agent_id: item.agent_id, error: err.message },
          }).catch(() => {});
        }
      }

      errors++;
    }
  }

  return { processed, errors };
}

// ==================== CADENCE PROCESSOR ====================

interface CadenceStepPostAction {
  type: 'move_stage' | 'create_task' | 'notify_human';
  target_stage?: string;
  task_title?: string;
}

interface CadenceStep {
  step_order: number;
  action_type: 'text' | 'ai_message' | 'ai_media' | 'image' | 'video' | 'audio' | 'webhook';
  content: string;
  caption?: string;
  delay_minutes: number;
  only_if_no_reply: boolean;
  repeat?: boolean;
  max_repeats?: number;
  post_action?: CadenceStepPostAction;
}

interface CadenceEnrollment {
  id: string;
  lead_id: string;
  agent_id: string;
  stage: string;
  current_step: number;
  status: string;
  next_action_at: string;
  enrolled_at: string;
  last_step_at: string | null;
  metadata: Record<string, any>;
}

/**
 * Busca a instância WhatsApp do lead (mesma lógica do processamento reativo)
 */
async function getLeadWhatsAppInstance(supabase: any, leadId: string, agentId?: string): Promise<WhatsAppInstance | null> {
  // 1. Tentar pela última mensagem do lead
  const { data: lastMsg } = await supabase
    .from('whatsapp_messages')
    .select('instance_id')
    .eq('lead_id', leadId)
    .is('group_id', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  if (lastMsg?.instance_id) {
    const { data: inst } = await supabase
      .from('whatsapp_instances')
      .select('id, api_key, api_url, metadata')
      .eq('id', lastMsg.instance_id)
      .eq('status', 'connected')
      .single();
    if (inst) return inst;
  }

  // 2. Fallback: instância do vendedor responsável pelo deal do lead
  console.log(`🔄 Sem mensagens para lead ${leadId}, buscando instância do vendedor responsável...`);
  const { data: deal } = await supabase
    .from('deals')
    .select('sales_rep_id')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (deal?.sales_rep_id) {
    const { data: rep } = await supabase
      .from('team_members')
      .select('whatsapp_instance_id')
      .eq('id', deal.sales_rep_id)
      .single();

    if (rep?.whatsapp_instance_id) {
      const { data: repInst } = await supabase
        .from('whatsapp_instances')
        .select('id, api_key, api_url, metadata')
        .eq('id', rep.whatsapp_instance_id)
        .eq('status', 'connected')
        .single();

      if (repInst) {
        console.log(`✅ Instância do vendedor encontrada: ${repInst.id}`);
        return repInst;
      }
    }
  }

  // 3. Fallback: instância do agente IA (para cadências proativas de leads sem histórico de msgs)
  if (agentId) {
    const { data: agentData } = await supabase
      .from('ai_sales_agents')
      .select('instance_id')
      .eq('id', agentId)
      .maybeSingle();

    if (agentData?.instance_id) {
      const { data: agentInst } = await supabase
        .from('whatsapp_instances')
        .select('id, api_key, api_url, metadata')
        .eq('id', agentData.instance_id)
        .eq('status', 'connected')
        .maybeSingle();

      if (agentInst) {
        console.log(`✅ Instância do agente IA encontrada: ${agentInst.id}`);
        return agentInst;
      }
    }
  }

  return null;
}

/**
 * Busca nome do closer (vendedor) do deal ativo do lead
 */
async function getCloserName(supabase: any, leadId: string): Promise<string> {
  try {
    const { data: deal } = await supabase
      .from('deals')
      .select('sales_rep:team_members(name)')
      .eq('lead_id', leadId)
      .in('status', ['open', 'won'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return deal?.sales_rep?.name || '';
  } catch {
    return '';
  }
}

/**
 * Executa um step individual da cadência
 */
async function executeCadenceStep(
  supabase: any,
  enrollment: CadenceEnrollment,
  step: CadenceStep,
  agent: AgentConfig & { cadence_steps: Record<string, CadenceStep[]> },
  lead: Lead,
  instance: WhatsAppInstance
): Promise<{ success: boolean; error?: string; sentMessage?: string }> {
  const settings = mergeSettings(agent.settings);
  const closerName = await getCloserName(supabase, lead.id);
  const replaceExtras = { closer: closerName };

  console.log(`📋 Executando cadence step ${step.step_order} (${step.action_type}) para lead ${lead.name}`);

  // Handoff: completar conversas de outros agentes na mesma instância
  const { data: otherConvos } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id')
    .eq('lead_id', lead.id)
    .eq('status', 'active')
    .neq('agent_id', agent.id);

  if (otherConvos) {
    for (const conv of otherConvos) {
      const { data: otherAg } = await supabase
        .from('ai_sales_agents')
        .select('instance_id')
        .eq('id', conv.agent_id)
        .maybeSingle();
      if (otherAg?.instance_id === instance.id) {
        await supabase
          .from('ai_agent_conversations')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', conv.id);
        console.log(`🔄 Cadence handoff: conversa ${conv.id} completada — ${agent.name} assumindo`);
      }
    }
  }

  try {
    // ===== CLOUD API: Step 0 = enviar template (primeiro contato oficial) =====
    if (enrollment.current_step === 0 && instance.metadata?.type === 'cloud_api') {
      const templateName = agent.settings?.template_name || instance.metadata?.template_name || 'primeiro_contato_qualificacao';
      const firstName = (lead.name || '').split(' ')[0] || 'Olá';
      console.log(`📋 [Cloud API] Step 0 — enviando template "${templateName}" para ${lead.phone}`);

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-cloud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_template",
          phone: lead.phone,
          template_name: templateName,
          template_params: [firstName],
          lead_id: lead.id,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        return { success: false, error: result.error || 'Erro ao enviar template' };
      }
      return { success: true, sentMessage: `[Template: ${templateName}] Olá ${firstName}...` };
    }

    switch (step.action_type) {
      case 'text': {
        const text = replaceVariables(step.content, lead, replaceExtras);
        const textResult = await sendHumanizedResponse(instance, lead.phone, text, settings, supabase, lead.id);
        return { success: textResult.ok, error: textResult.error, sentMessage: text };
      }

      case 'ai_message': {
        // Usar OpenAI com prompt principal do agente + historico da conversa + instrucao do step
        const instruction = replaceVariables(step.content, lead, replaceExtras);

        // Buscar últimas mensagens da conversa para contexto (SOMENTE da instância deste agente)
        // MULTI-PIPELINE: se é step 0 (primeira abordagem), NÃO usar histórico anterior
        // O lead pode ter conversado antes por outro motivo — cadência nova = conversa do zero
        let recentMsgs: any[] | null = null;
        if (enrollment.current_step > 0) {
          let recentMsgsQuery = supabase
            .from('whatsapp_messages')
            .select('content, is_from_me, sent_at')
            .eq('lead_id', lead.id)
            .is('group_id', null)
            .order('sent_at', { ascending: false })
            .limit(10);
          if (agent.instance_id) {
            recentMsgsQuery = recentMsgsQuery.eq('instance_id', agent.instance_id);
          }
          const { data } = await recentMsgsQuery;
          recentMsgs = data;
        } else {
          console.log(`🆕 Step 0: ignorando histórico de msgs — primeira abordagem da cadência`);
        }

        const nowBrasilia = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const dataAtual = nowBrasilia.toISOString().slice(0, 10);
        const horaAtual = nowBrasilia.toISOString().slice(11, 16);

        let conversationHistory = `\n## DATA E HORA ATUAL: ${dataAtual} ${horaAtual} (horário de Brasília)\n`;
        if (recentMsgs && recentMsgs.length > 0) {
          const sorted = [...recentMsgs].reverse();
          conversationHistory += '## HISTORICO RECENTE DA CONVERSA\n' +
            sorted.map((m: any) => {
              const sender = m.is_from_me ? 'Voce' : lead.name;
              const msgTime = m.sent_at ? new Date(new Date(m.sent_at).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ') : '';
              return `[${msgTime}] ${sender}: ${(m.content || '[midia]').substring(0, 200)}`;
            }).join('\n');
        }

        // Buscar mensagens anteriores desta cadência (para evitar repetição)
        // Step 0: só buscar logs DEPOIS do enrolled_at (ignora cadências anteriores)
        let prevCadenceQuery = supabase
          .from('ai_agent_logs')
          .select('data')
          .eq('lead_id', lead.id)
          .eq('agent_id', agent.id)
          .eq('log_type', 'message_sent')
          .order('created_at', { ascending: false })
          .limit(5);
        if (enrollment.current_step === 0) {
          prevCadenceQuery = prevCadenceQuery.gte('created_at', enrollment.enrolled_at);
        }
        const { data: prevCadenceLogs } = await prevCadenceQuery;

        let previousCadenceMsgs = '';
        if (prevCadenceLogs && prevCadenceLogs.length > 0) {
          const cadenceMsgs = prevCadenceLogs
            .filter((log: any) => log.data?.source === 'cadence' || log.data?.content)
            .map((log: any) => log.data?.content)
            .filter(Boolean);
          if (cadenceMsgs.length > 0) {
            previousCadenceMsgs = '\n## MENSAGENS JA ENVIADAS (NAO REPITA)\n' +
              cadenceMsgs.map((m: string, i: number) => `${i + 1}. ${m.substring(0, 200)}`).join('\n');
          }
        }

        // Substituir variaveis no prompt principal do agente
        let agentPrompt = agent.system_prompt || '';
        agentPrompt = agentPrompt.replace(/\{\{nome\}\}/g, lead.name || '');
        agentPrompt = agentPrompt.replace(/\{\{empresa\}\}/g, lead.company_name || '');
        agentPrompt = agentPrompt.replace(/\{\{estagio\}\}/g, lead.pipeline_stage_name || lead.sales_stage || '');
        agentPrompt = agentPrompt.replace(/\{\{telefone\}\}/g, lead.phone || '');
        agentPrompt = agentPrompt.replace(/\{\{email\}\}/g, lead.email || '');

        // Buscar contexto Instagram do lead
        let instagramContext = '';
        try {
          if (lead.instagram_profile_id) {
            const { data: igProfile } = await supabase
              .from('instagram_profiles')
              .select('username, full_name, biography, follower_count, following_count, is_verified')
              .eq('id', lead.instagram_profile_id)
              .single();
            if (igProfile) {
              instagramContext += `\n## PERFIL INSTAGRAM DO LEAD (@${igProfile.username})`;
              if (igProfile.biography) instagramContext += `\n- Bio: ${igProfile.biography}`;
              instagramContext += `\n- Seguidores: ${igProfile.follower_count || 0}`;
              if (igProfile.is_verified) instagramContext += `\n- Verificado`;
            }
          }
          // Buscar conversa Instagram + AI analysis
          if (lead.instagram || lead.instagram_profile_id) {
            const igFilter = lead.instagram
              ? { column: 'participant_username', value: lead.instagram }
              : { column: 'lead_id', value: lead.id };
            const { data: igConv } = await supabase
              .from('instagram_conversations')
              .select('last_message, metadata, total_messages')
              .eq(igFilter.column, igFilter.value)
              .order('last_message_at', { ascending: false })
              .limit(1)
              .single();
            if (igConv?.metadata?.ai_analysis) {
              const analysis = igConv.metadata.ai_analysis;
              instagramContext += `\n## ANALISE DA CONVERSA INSTAGRAM`;
              if (analysis.interesse) instagramContext += `\n- Nivel de interesse: ${analysis.interesse}`;
              // NÃO passar contexto_deal nem produtos_mencionados - podem ser alucinações do Gemini
              // O contexto real vem das mensagens do Instagram abaixo
            }
            // Mensagens do Instagram
            if (igConv) {
              const { data: igMsgs } = await supabase
                .from('instagram_messages')
                .select('content, is_from_me, sender_username, message_type, reference_type, sent_at')
                .eq('conversation_id', igConv.id || '')
                .order('sent_at', { ascending: true })
                .limit(10);
              if (igMsgs && igMsgs.length > 0) {
                instagramContext += `\n## MENSAGENS INSTAGRAM`;
                for (const m of igMsgs) {
                  const sender = m.is_from_me ? 'Vendedor' : (m.sender_username || lead.name);
                  const tipo = m.message_type !== 'text' ? ` [${m.message_type}${m.reference_type ? ` em ${m.reference_type}` : ''}]` : '';
                  instagramContext += `\n${sender}${tipo}: ${(m.content || '[midia]').substring(0, 200)}`;
                }
              }
            }
          }
        } catch (igErr) {
          console.error('⚠️ Erro ao buscar contexto Instagram na cadencia:', igErr);
        }

        // Buscar BANT e insights para contexto enriquecido (sequências no-show/reengajamento)
        let bantContext = '';
        if (lead.bant_budget || lead.bant_authority || lead.bant_need || lead.bant_timeline) {
          bantContext = '\n## BANT (QUALIFICACAO DO LEAD)';
          if (lead.bant_budget) bantContext += `\n- Budget: ${lead.bant_budget}`;
          if (lead.bant_authority) bantContext += `\n- Authority: ${lead.bant_authority}`;
          if (lead.bant_need) bantContext += `\n- Need: ${lead.bant_need}`;
          if (lead.bant_timeline) bantContext += `\n- Timeline: ${lead.bant_timeline}`;
        }

        let insightsContext = '';
        if (lead.ai_conversation_insights) {
          const insights = typeof lead.ai_conversation_insights === 'string'
            ? lead.ai_conversation_insights
            : JSON.stringify(lead.ai_conversation_insights);
          insightsContext = `\n## INSIGHTS DA CONVERSA (gerados por IA)\n${insights.substring(0, 500)}`;
        }

        const repeatInfo = enrollment.metadata?.repeat_count
          ? `\nEsta e a mensagem diaria #${enrollment.metadata.repeat_count + 1}. VARIE a abordagem — use angulos diferentes a cada dia.`
          : '';

        // === CONTEXTO COMPLETO DO LEAD (deals, calls, meetings, tarefas, notas) ===
        let fullLeadContext = '';
        try {
          fullLeadContext = await getFullLeadContext(supabase, lead, settings, instance?.id);
          console.log(`📚 Contexto completo carregado para cadência do lead ${lead.name} (${fullLeadContext.length} chars)`);
        } catch (ctxErr) {
          console.error('⚠️ Erro ao buscar contexto completo na cadência (non-fatal):', ctxErr);
        }

        // === YELLOW FLAG: Detectar atividade prévia para evitar tratar lead como novo ===
        let yellowFlag = '';
        try {
          // Checar deal ativo
          const { data: activeDeals } = await supabase
            .from('deals')
            .select('title, status, pipeline_stage:sales_pipeline_stages(name)')
            .eq('lead_id', lead.id)
            .in('status', ['open', 'negotiation'])
            .limit(3);

          // Checar chamadas recentes (últimos 14 dias)
          const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
          const { data: recentCalls } = await supabase
            .from('call_history')
            .select('started_at, direction, duration_seconds, ai_summary')
            .eq('lead_id', lead.id)
            .eq('status', 'ENDED')
            .gt('started_at', fourteenDaysAgo)
            .gt('duration_seconds', 30)
            .order('started_at', { ascending: false })
            .limit(3);

          // Checar reunião agendada (tarefas meeting/call futuras não completadas)
          const nowISO = new Date().toISOString();
          const { data: scheduledMeetings } = await supabase
            .from('company_activities')
            .select('name, scheduled_at, task_type')
            .eq('lead_id', lead.id)
            .in('task_type', ['meeting', 'call'])
            .eq('completed', false)
            .gt('scheduled_at', nowISO)
            .order('scheduled_at', { ascending: true })
            .limit(3);

          const hasActiveDeal = activeDeals && activeDeals.length > 0;
          const hasRecentCall = recentCalls && recentCalls.length > 0;
          const hasScheduledMeeting = scheduledMeetings && scheduledMeetings.length > 0;

          if (hasActiveDeal || hasRecentCall || hasScheduledMeeting) {
            const flags: string[] = [];
            if (hasActiveDeal) {
              for (const d of activeDeals!) {
                flags.push(`- Tem deal ativo: "${d.title}" na etapa "${d.pipeline_stage?.name || 'N/A'}"`);
              }
            }
            if (hasRecentCall) {
              for (const c of recentCalls!) {
                const callDate = new Date(c.started_at).toLocaleDateString('pt-BR');
                const dur = c.duration_seconds ? `${Math.round(c.duration_seconds / 60)}min` : '';
                flags.push(`- Teve ${c.direction === 'outgoing' ? 'chamada' : 'ligacao recebida'} em ${callDate} (${dur})${c.ai_summary ? ': ' + c.ai_summary.substring(0, 100) : ''}`);
              }
            }
            if (hasScheduledMeeting) {
              for (const m of scheduledMeetings!) {
                const meetDate = new Date(m.scheduled_at).toLocaleDateString('pt-BR');
                flags.push(`- Tem ${m.task_type === 'meeting' ? 'reuniao' : 'chamada'} agendada para ${meetDate}: "${m.name}"`);
              }
            }

            yellowFlag = `\n## ⚠️ ATENCAO CRITICA: LEAD COM HISTORICO DE INTERACOES
Este lead NAO e novo. Ele ja teve interacoes anteriores com a equipe:
${flags.join('\n')}

REGRAS ESPECIAIS PARA ESTE LEAD:
- NAO se apresente como se fosse a primeira vez
- NAO faca perguntas que ja foram respondidas nas chamadas/reunioes anteriores
- Use o contexto das chamadas/reunioes anteriores para continuar a conversa de forma natural
- Sua mensagem deve dar continuidade ao relacionamento existente
- Referencie algo especifico que foi discutido anteriormente para mostrar que voce lembra\n`;

            console.log(`🟡 Yellow flag ativada para lead ${lead.name}: ${flags.length} sinais de atividade prévia`);
          }
        } catch (yfErr) {
          console.error('⚠️ Erro ao gerar yellow flag (non-fatal):', yfErr);
        }

        const systemPrompt = `${agentPrompt}

---

## CONTEXTO DA CADENCIA (FOLLOW-UP PROATIVO)
Voce esta enviando uma mensagem de follow-up proativo para este lead.
Este e o passo ${step.step_order + 1} da cadencia (estagio: ${enrollment.stage}).${repeatInfo}
Instrucao especifica deste passo: ${instruction}
${yellowFlag}
## INFORMACOES DO LEAD
- Nome: ${lead.name}
- Estagio: ${lead.pipeline_stage_name || lead.sales_stage || 'Novo'}
- Empresa: ${lead.company_name || 'Nao informada'}
- Contexto: ${lead.context || 'Nenhum'}
- Score: ${lead.sales_score || 0}/100
- Closer: ${closerName || 'Nao definido'}
${bantContext}
${insightsContext}
${fullLeadContext ? '\n## CONTEXTO COMPLETO (deals, chamadas, reunioes, tarefas)\n' + fullLeadContext : ''}
${instagramContext}
${conversationHistory}
${previousCadenceMsgs}

## PERSONALIDADE
${agent.personality_traits.join(', ')}

## REGRAS OBRIGATORIAS PARA ESTA MENSAGEM
1. Siga TODAS as regras do seu prompt principal acima (tom, estilo, restricoes)
2. Mensagem curta e natural de WhatsApp (maximo 2-3 frases)
3. NUNCA repita o conteudo ou abordagem das mensagens ja enviadas listadas acima
4. VARIE o estilo de abertura - NAO comece sempre com o nome do lead ou saudacao
5. Use o PRIMEIRO NOME do lead no MAXIMO 1 vez na conversa (na primeira msg). Depois NUNCA mais use o nome — e sinal de IA. Se precisar se referir ao lead, use "tu", "vc", "voce".
6. Quando usar o nome, use APENAS o primeiro nome em minusculo (ex: "raphael", NAO "RAPHAEL COELHO")
7. Se o lead veio do Instagram por comentario em Reel, o comentario dele provavelmente e o NICHO ou PROFISSAO dele (respondendo ao CTA "manda aqui qual e o seu nicho"). NAO confunda com uma necessidade ou produto. Use APENAS para saber QUEM ele e. NAO faca perguntas sobre essa area como se fosse um problema dele — e o TRABALHO dele.
8. Na primeira mensagem, seja generico e curto: pergunte o que ele faz, qual o negocio. NAO tente adivinhar o contexto ou fazer perguntas especificas sobre a area dele.
9. SEMPRE termine com uma pergunta
10. Responda APENAS com a mensagem, sem formatacao extra`;

        const aiMsg = await callLLMSimple(
          agent.model,
          systemPrompt,
          [], // Sem mensagens user - tudo está no system prompt para cadence
          agent.temperature,
          300,
        );

        if (!aiMsg) return { success: false, error: 'IA nao gerou mensagem' };

        const aiMsgResult = await sendHumanizedResponse(instance, lead.phone, aiMsg, settings, supabase, lead.id);
        return { success: aiMsgResult.ok, error: aiMsgResult.error, sentMessage: aiMsg };
      }

      case 'ai_media': {
        // IA escolhe o melhor material de venda baseado no contexto da conversa
        const mediaInstruction = replaceVariables(step.content, lead, replaceExtras);

        // Buscar materiais ativos marcados para uso pelo agente IA
        const { data: materials } = await supabase
          .from('sales_materials')
          .select('id, name, description, type, file_url, tags, usage_hint')
          .eq('is_active', true)
          .contains('tags', ['agente-ia'])
          .order('name');

        if (!materials || materials.length === 0) {
          console.log('⚠️ Nenhum material com tag agente-ia encontrado');
          return { success: false, error: 'Nenhum material marcado para Agente IA (tag: agente-ia)' };
        }

        // Buscar historico da conversa para contexto
        const { data: recentMsgsMedia } = await supabase
          .from('whatsapp_messages')
          .select('content, is_from_me, sent_at')
          .eq('lead_id', lead.id)
          .is('group_id', null)
          .order('sent_at', { ascending: false })
          .limit(10);

        let mediaConversationHistory = '';
        if (recentMsgsMedia && recentMsgsMedia.length > 0) {
          const sorted = [...recentMsgsMedia].reverse();
          mediaConversationHistory = sorted.map((m: any) => {
            const sender = m.is_from_me ? 'Vendedor' : lead.name;
            return `${sender}: ${(m.content || '[midia]').substring(0, 200)}`;
          }).join('\n');
        }

        // Montar catalogo de materiais para a IA
        const materialsCatalog = materials.map((m: any, i: number) => {
          return `[${i}] ${m.name} (${m.type}) - ${m.description || 'Sem descricao'}${m.usage_hint ? ` | Dica: ${m.usage_hint}` : ''}${m.tags?.length ? ` | Tags: ${m.tags.join(', ')}` : ''}`;
        }).join('\n');

        // Pedir para IA escolher o melhor material + gerar legenda
        const mediaPrompt = `Voce e um assistente de vendas que precisa escolher o MELHOR material de apoio para enviar a um lead via WhatsApp.

## INSTRUCAO DO VENDEDOR
${mediaInstruction}

## INFORMACOES DO LEAD
- Nome: ${lead.name}
- Estagio: ${lead.pipeline_stage_name || lead.sales_stage || 'Novo'}
- Empresa: ${lead.company_name || 'Nao informada'}

## HISTORICO DA CONVERSA
${mediaConversationHistory || 'Nenhuma conversa anterior.'}

## MATERIAIS DISPONIVEIS
${materialsCatalog}

## REGRAS
1. Analise o contexto da conversa e escolha o material MAIS RELEVANTE para este lead
2. Se nenhum material for relevante, responda com {"index": -1}
3. Gere uma legenda curta e natural para acompanhar o envio (maximo 2 frases)
4. A legenda deve contextualizar o material para este lead especifico

Responda APENAS com JSON valido neste formato:
{"index": NUMERO_DO_MATERIAL, "caption": "legenda personalizada aqui"}`;

        const aiChoice = await callLLMSimple(
          agent.model,
          mediaPrompt,
          [], // Tudo no system prompt
          0.3,
          200,
        );

        // Parse JSON da resposta da IA
        let selectedIndex = -1;
        let generatedCaption = '';
        try {
          const cleaned = aiChoice.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          selectedIndex = parsed.index;
          generatedCaption = parsed.caption || '';
        } catch {
          console.error('❌ Falha ao parsear resposta da IA (ai_media):', aiChoice);
          return { success: false, error: 'IA retornou formato invalido para selecao de midia' };
        }

        if (selectedIndex < 0 || selectedIndex >= materials.length) {
          console.log('⚠️ IA decidiu nao enviar nenhum material (index:', selectedIndex, ')');
          // Fallback: enviar mensagem de texto com a instrucao via IA
          const fallbackText = `Nenhum material relevante para o contexto. Instrucao original: ${mediaInstruction}`;
          console.log('📋 Fallback ai_media → nenhum material selecionado, pulando step');
          return { success: true, sentMessage: `[ai_media: nenhum material relevante - step pulado]` };
        }

        const chosenMaterial = materials[selectedIndex];
        console.log(`🎯 IA escolheu material: ${chosenMaterial.name} (${chosenMaterial.type})`);

        // Enviar conforme o tipo do material
        let mediaSent = false;
        let mediaSendError: string | undefined;
        const captionText = generatedCaption ? replaceVariables(generatedCaption, lead) : undefined;

        switch (chosenMaterial.type) {
          case 'image':
            mediaSent = await sendWhatsAppImage(instance, lead.phone, chosenMaterial.file_url, captionText);
            break;
          case 'video':
            mediaSent = await sendWhatsAppVideo(instance, lead.phone, chosenMaterial.file_url, captionText);
            break;
          case 'audio':
            mediaSent = await sendWhatsAppAudio(instance, lead.phone, chosenMaterial.file_url);
            break;
          case 'document':
          default: {
            // Documentos: enviar como texto com link
            const docResult = captionText
              ? await sendHumanizedResponse(instance, lead.phone, `${captionText}\n\n${chosenMaterial.file_url}`, settings, supabase, lead.id)
              : await sendHumanizedResponse(instance, lead.phone, chosenMaterial.file_url, settings, supabase, lead.id);
            mediaSent = docResult.ok;
            mediaSendError = docResult.error;
            break;
          }
        }

        return {
          success: mediaSent,
          error: mediaSent ? undefined : (mediaSendError || `Falha ao enviar ${chosenMaterial.type} (${chosenMaterial.name})`),
          sentMessage: `[ai_media: ${chosenMaterial.name}] ${generatedCaption}`,
        };
      }

      case 'image': {
        const caption = step.caption ? replaceVariables(step.caption, lead, replaceExtras) : undefined;
        const sent = await sendWhatsAppImage(instance, lead.phone, step.content, caption);
        return { success: sent };
      }

      case 'video': {
        const caption = step.caption ? replaceVariables(step.caption, lead, replaceExtras) : undefined;
        const sent = await sendWhatsAppVideo(instance, lead.phone, step.content, caption);
        return { success: sent };
      }

      case 'audio': {
        const sent = await sendWhatsAppAudio(instance, lead.phone, step.content);
        return { success: sent };
      }

      case 'webhook': {
        const webhookResponse = await fetch(step.content, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: lead.phone,
            lead_email: lead.email,
            lead_stage: lead.pipeline_stage_name || lead.sales_stage,
            lead_company: lead.company_name,
            enrollment_id: enrollment.id,
            cadence_stage: enrollment.stage,
            step_order: step.step_order,
            agent_name: agent.name,
            timestamp: new Date().toISOString(),
          }),
        });
        return { success: webhookResponse.ok };
      }

      default:
        return { success: false, error: `Tipo de acao desconhecido: ${step.action_type}` };
    }
  } catch (error: any) {
    console.error(`❌ Erro no cadence step:`, error);
    return { success: false, error: error.message };
  }
}

// ==================== RATE LIMITING ====================

type ContactType = 'cold' | 'followup_unreplied' | 'reply';

/**
 * Verifica se o rate limit permite envio para a instância.
 * Três camadas:
 * 1. Global: max mensagens/hora e /dia (todo tipo de outbound)
 * 2. Cold: contatos novos que nunca falaram conosco
 * 3. Follow-up unreplied: leads que não responderam nenhuma mensagem
 * Replies (lead mandou msg primeiro) = sem limite de contatos
 */
async function checkRateLimit(
  supabase: any,
  instanceId: string,
  settings: AgentSettings,
  contactType: ContactType = 'cold'
): Promise<{ allowed: boolean; reason?: string; hourCount?: number; dayCount?: number }> {
  // Replies (lead initiated) never hit rate limit — zero risk
  if (contactType === 'reply') {
    return { allowed: true, hourCount: 0, dayCount: 0 };
  }

  // Cloud API (oficial) não tem risco de bloqueio — sem rate limit
  const { data: inst } = await supabase
    .from('whatsapp_instances')
    .select('metadata')
    .eq('id', instanceId)
    .maybeSingle();
  if (inst?.metadata?.type === 'cloud_api') {
    return { allowed: true, hourCount: 0, dayCount: 0 };
  }

  const now = new Date();
  const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Buscar contagens em paralelo: global (hour/day) + tipo específico
  const windowTypes = ['hour', 'day'];
  if (contactType === 'cold') windowTypes.push('cold_day');
  if (contactType === 'followup_unreplied') windowTypes.push('followup_unreplied_day');

  const queries = windowTypes.map(wt => {
    const ws = wt.includes('day') ? dayStart : hourStart;
    return supabase
      .from('ai_agent_send_counts')
      .select('message_count')
      .eq('instance_id', instanceId)
      .eq('window_type', wt)
      .eq('window_start', ws)
      .maybeSingle();
  });

  const results = await Promise.all(queries);
  const counts: Record<string, number> = {};
  windowTypes.forEach((wt, i) => {
    counts[wt] = results[i].data?.message_count || 0;
  });

  const hourCount = counts['hour'] || 0;
  const dayCount = counts['day'] || 0;

  // 1. Global hourly limit
  if (hourCount >= settings.cadence_max_messages_per_hour) {
    return {
      allowed: false,
      reason: `Limite horário atingido (${hourCount}/${settings.cadence_max_messages_per_hour})`,
      hourCount,
      dayCount,
    };
  }

  // 2. Global daily limit
  if (dayCount >= settings.cadence_max_messages_per_day) {
    return {
      allowed: false,
      reason: `Limite diário atingido (${dayCount}/${settings.cadence_max_messages_per_day})`,
      hourCount,
      dayCount,
    };
  }

  // 3. Cold contact daily limit (highest risk)
  if (contactType === 'cold') {
    const coldCount = counts['cold_day'] || 0;
    if (coldCount >= settings.max_new_contacts_per_day) {
      return {
        allowed: false,
        reason: `Limite de contatos frios atingido (${coldCount}/${settings.max_new_contacts_per_day})`,
        hourCount,
        dayCount,
      };
    }
  }

  // 4. Follow-up unreplied daily limit (medium risk)
  if (contactType === 'followup_unreplied') {
    const fuCount = counts['followup_unreplied_day'] || 0;
    if (fuCount >= settings.max_followups_unreplied_per_day) {
      return {
        allowed: false,
        reason: `Limite de follow-ups sem resposta atingido (${fuCount}/${settings.max_followups_unreplied_per_day})`,
        hourCount,
        dayCount,
      };
    }
  }

  return { allowed: true, hourCount, dayCount };
}

/**
 * Incrementa contadores de envio: global (hour + day) + tipo específico
 */
async function incrementSendCount(supabase: any, instanceId: string, contactType?: ContactType): Promise<void> {
  const now = new Date();
  const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const upsertWindow = async (windowType: string, windowStart: string) => {
    const { error } = await supabase.rpc('increment_send_count_upsert', {
      p_instance_id: instanceId,
      p_window_start: windowStart,
      p_window_type: windowType,
    });
    if (error) {
      await supabase
        .from('ai_agent_send_counts')
        .upsert(
          { instance_id: instanceId, window_start: windowStart, window_type: windowType, message_count: 1 },
          { onConflict: 'instance_id,window_start,window_type' }
        );
    }
  };

  // Always increment global hour + day
  const promises: Promise<void>[] = [
    upsertWindow('hour', hourStart),
    upsertWindow('day', dayStart),
  ];

  // Also increment contact-type specific counter
  if (contactType === 'cold') {
    promises.push(upsertWindow('cold_day', dayStart));
  } else if (contactType === 'followup_unreplied') {
    promises.push(upsertWindow('followup_unreplied_day', dayStart));
  }

  await Promise.all(promises);
}

/**
 * Classifica se um erro de envio é temporário (retry) ou permanente (cancelar)
 */
function isTemporaryError(errorMsg: any): boolean {
  const msg = typeof errorMsg === 'string' ? errorMsg : String(errorMsg || '');
  const temporaryPatterns = [
    'disconnected',
    'timeout',
    'rate limit',
    'unavailable',
    '503',
    '429',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'network',
    'socket hang up',
    'fetch failed',
  ];
  const lowerError = msg.toLowerCase();
  return temporaryPatterns.some(p => lowerError.includes(p.toLowerCase()));
}

/**
 * Executa um follow-up agendado — gera mensagem contextual com IA e envia
 */
async function executeScheduledFollowup(supabase: any, followup: any, globalAgent: any): Promise<boolean> {
  console.log(`📅 Executando follow-up agendado para lead ${followup.lead_id}`);

  // LOCK: Adquirir lock exclusivo pro lead antes de qualquer processamento.
  // Impede que queue, orphan recovery ou outro follow-up rode em paralelo.
  const { data: lockAcquired } = await supabase.rpc('try_acquire_agent_lock', {
    p_lead_id: followup.lead_id,
    p_lock_duration: '90 seconds',
  });
  if (!lockAcquired) {
    console.log(`🔒 Follow-up ${followup.id}: Lock não adquirido para lead ${followup.lead_id} — outra instância processando`);
    return false; // Caller vai manter como 'processing', próximo tick tenta de novo
  }

  try {
  // GUARD 1: Verificar se o agente já mandou msg para este lead nos últimos 5 minutos
  const recentCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recentAgentMsg } = await supabase
    .from('whatsapp_messages')
    .select('id, sent_at')
    .eq('lead_id', followup.lead_id)
    .eq('is_from_me', true)
    .is('group_id', null)
    .gt('sent_at', recentCutoff)
    .limit(1)
    .maybeSingle();

  if (recentAgentMsg) {
    console.log(`⏭️ Follow-up ${followup.id} — agente já mandou msg há <5min para lead ${followup.lead_id}, pulando (anti-duplicata)`);
    await supabase
      .from('ai_agent_scheduled_followups')
      .update({ status: 'sent', attempts: (followup.attempts || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', followup.id);
    return true;
  }

  // GUARD 2: Se houve interação (qualquer msg do lead OU do agente) DEPOIS que o follow-up foi criado,
  // o contexto do follow-up está stale — a conversa já avançou.
  const followupCreatedAt = followup.created_at || followup.scheduled_for;
  if (followupCreatedAt) {
    const { count: msgsAfterFollowup } = await supabase
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', followup.lead_id)
      .is('group_id', null)
      .gt('sent_at', followupCreatedAt);

    if (msgsAfterFollowup && msgsAfterFollowup > 0) {
      console.log(`⏭️ Follow-up ${followup.id} — ${msgsAfterFollowup} msg(s) trocada(s) após agendamento, contexto stale. Cancelando.`);
      await supabase
        .from('ai_agent_scheduled_followups')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', followup.id);
      return true;
    }
  }

  const agentId = followup.agent_id || globalAgent.id;
  const { data: agent } = await supabase
    .from('ai_sales_agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (!agent) {
    await supabase.from('ai_agent_scheduled_followups')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', followup.id);
    return false;
  }

  const settings = mergeSettings(agent.settings);
  if (!isWithinWorkingHours(settings)) {
    console.log(`⏭️ Fora do horário, adiando follow-up ${followup.id}`);
    return false;
  }

  const { data: lead } = await supabase.from('leads').select('*').eq('id', followup.lead_id).single();
  if (!lead) {
    await supabase.from('ai_agent_scheduled_followups')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', followup.id);
    return false;
  }
  // Resolver telefone real do WhatsApp (corrige 9º dígito e divergências)
  lead.phone = await resolveLeadPhone(supabase, lead.id, lead.phone);
  await enrichLeadWithStageName(supabase, lead);

  // REGRA: se agente tem instance_id, usa SOMENTE ela. Sem fallback.
  let instance: WhatsAppInstance | null = null;
  if (agent.instance_id) {
    const { data: agentInst } = await supabase
      .from('whatsapp_instances')
      .select('id, api_key, api_url, metadata, status')
      .eq('id', agent.instance_id)
      .single();
    if (!agentInst) {
      console.log(`🚫 Instância do agente ${agent.instance_id} não encontrada — NÃO usar fallback`);
      return false;
    }
    if (agentInst.status === 'disconnected' && agentInst.metadata?.type !== 'cloud_api') {
      console.log(`🚫 Instância do agente ${agent.instance_id} desconectada — NÃO enviar por outra instância`);
      return false;
    }
    instance = agentInst;
    console.log(`📱 Follow-up usando instância do agente: ${instance.id} (${agentInst.metadata?.type || 'uazapi'})`);
  } else {
    instance = await getLeadWhatsAppInstance(supabase, lead.id);
  }
  if (!instance) {
    console.log(`⏭️ Sem instância WhatsApp para follow-up de ${lead.name}`);
    return false;
  }

  const rateCheck = await checkRateLimit(supabase, instance.id, settings, 'followup_unreplied');
  if (!rateCheck.allowed) {
    console.log(`🚫 Rate limit para follow-up de ${lead.name}: ${rateCheck.reason}`);
    return false;
  }

  // Load conversation
  const { data: conv } = await supabase
    .from('ai_agent_conversations')
    .select('*')
    .eq('id', followup.conversation_id)
    .maybeSingle();

  const messagesHistory = conv?.messages_history || [];

  // Add follow-up instruction as context
  const followupInstruction = {
    role: 'user',
    content: `[SISTEMA - FOLLOW-UP AGENDADO]\nO lead pediu pra falar neste horário. Contexto: ${followup.context_note || 'Lead prometeu retomar conversa.'}\nRetome a conversa de forma natural e casual. NÃO repita sua apresentação. Seja breve (1-2 linhas max). Continue de onde parou na qualificação. Termine com uma pergunta.`,
  };

  const messagesForAI = [...messagesHistory, followupInstruction];

  // Load agent tools
  const { data: toolsData } = await supabase
    .from('ai_agent_tools')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('is_active', true);

  const aiResponse = await callOpenAIWithTools(
    supabase,
    agent,
    toolsData || [],
    lead,
    messagesHistory,
    followupInstruction.content,
  );

  if (!aiResponse || !aiResponse.message) {
    console.error(`❌ Sem resposta da IA para follow-up de ${lead.name}`);
    return false;
  }

  let responseMessage = stripInternalThinking((aiResponse.message || '')).replace(/\[MEDIA:\d+\]\s*\n?/g, '').trim();
  if (!responseMessage) return false;

  // Send via WhatsApp
  const target = `${lead.phone}@s.whatsapp.net`;
  const sendResult = await sendWhatsAppMessage(instance, target, responseMessage, false, supabase, lead.id);

  if (!sendResult.ok) {
    console.error(`❌ Erro ao enviar follow-up para ${lead.name}: ${sendResult.error}`);
    return false;
  }

  // ================================================================
  // PONTO SEM RETORNO: mensagem foi enviada com sucesso via WhatsApp.
  // A partir daqui, NENHUM erro pode resetar o follow-up pra 'pending'.
  // Mark as sent IMEDIATAMENTE — antes de qualquer outra operação.
  // ================================================================
  try {
    await supabase
      .from('ai_agent_scheduled_followups')
      .update({ status: 'sent', attempts: (followup.attempts || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', followup.id);
  } catch (markErr) {
    console.error(`⚠️ Erro ao marcar follow-up ${followup.id} como sent (msg JÁ FOI ENVIADA):`, markErr);
    // Tentar novamente — é crítico que status fique 'sent'
    try {
      await supabase
        .from('ai_agent_scheduled_followups')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', followup.id);
    } catch {}
  }

  // Operações pós-envio: cada uma em try/catch isolado.
  // Falhas aqui NÃO podem afetar o status do follow-up.

  try {
    await incrementSendCount(supabase, instance.id, 'followup_unreplied');
  } catch (incErr) {
    console.error(`⚠️ incrementSendCount falhou para follow-up ${followup.id}:`, incErr);
  }

  try {
    if (conv) {
      const updatedHistory = [
        ...messagesHistory,
        { role: 'assistant', content: responseMessage, timestamp: new Date().toISOString(), source: 'scheduled_followup' },
      ];
      await supabase
        .from('ai_agent_conversations')
        .update({ messages_history: updatedHistory, last_processed_at: new Date().toISOString() })
        .eq('id', conv.id);
    }
  } catch (convErr) {
    console.error(`⚠️ Erro ao atualizar conversation history para follow-up ${followup.id}:`, convErr);
  }

  // Mark messages as AI (fire-and-forget)
  const beforeSend = new Date(Date.now() - 2000).toISOString();
  markRecentMessagesAsAI(supabase, lead.id, agent.id, agent.name, beforeSend)
    .catch((err: any) => console.error('Erro ao marcar msgs follow-up como AI:', err));

  try {
    await supabase.from('ai_agent_logs').insert({
      conversation_id: conv?.id || null,
      lead_id: lead.id,
      agent_id: agent.id,
      log_type: 'message_sent',
      data: { source: 'scheduled_followup', content: responseMessage, context_note: followup.context_note, followup_id: followup.id },
    });
  } catch (logErr) {
    console.error(`⚠️ Erro ao inserir log para follow-up ${followup.id}:`, logErr);
  }

  console.log(`✅ Follow-up enviado para ${lead.name}: "${responseMessage.substring(0, 80)}"`);
  return true;

  } finally {
    // SEMPRE liberar o lock
    try { await supabase.rpc('release_agent_lock', { p_lead_id: followup.lead_id }); } catch {}
  }
}

/**
 * Processador de lembretes de calls/reuniões agendadas
 * Cadência: confirmação inicial (noite) → D-3 (manhã) → D-2 (manhã) → D-1/24h → "é hoje" (7h BRT) → 30min (com link) → no-show
 * Todas as mensagens geradas por LLM com tom casual e personalizado
 */
async function processCallReminders(supabase: any): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    const now = new Date();
    const nowISO = now.toISOString();

    // Helper: get BRT hour from current time
    const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const brtHour = brtNow.getUTCHours();

    console.log(`🔔 processCallReminders: now=${nowISO}, brtHour=${brtHour}`);

    // ===== 0A. CONFIRMAÇÃO INICIAL (noite do agendamento, 19h-20h BRT) =====
    if (brtHour >= 19 && brtHour < 20) {
      // Buscar tarefas criadas HOJE, tipo call/meeting, com lead+phone, agendadas para um dia futuro
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setUTCHours(23, 59, 59, 999);
      const tomorrowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      tomorrowStart.setUTCHours(0, 0, 0, 0);

      const { data: tasksInitial } = await supabase
        .from('company_activities')
        .select(`
          id, name, scheduled_at, meeting_link, lead_id, responsavel_id, metadata, description, created_at,
          lead:leads!company_activities_lead_id_fkey(id, name, phone, email, instagram, company_name, sales_rep_id, challenges, context)
        `)
        .eq('completed', false)
        .in('task_type', ['meeting', 'call'])
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString())
        .gte('scheduled_at', tomorrowStart.toISOString()); // agendada para amanhã ou depois

      for (const task of (tasksInitial || [])) {
        if (task.metadata?.reminder_initial_sent) continue;
        if (!task.lead?.phone) continue;

        try {
          const { instance, agent } = await getLeadInstanceAndAgent(supabase, task.lead);
          if (!instance || !agent) continue;

          const { data: lockAcquired } = await supabase.rpc('try_acquire_agent_lock', {
            p_lead_id: task.lead_id,
            p_lock_duration: '90 seconds',
          });
          if (!lockAcquired) continue;

          try {
            const meetDate = new Date(task.scheduled_at);
            const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
            const meetDay = dayNames[meetDate.getUTCDay()];
            const meetHour = meetDate.getUTCHours() - 3 < 0 ? meetDate.getUTCHours() + 21 : meetDate.getUTCHours() - 3;
            const meetTime = `${String(meetHour).padStart(2, '0')}:${String(meetDate.getUTCMinutes()).padStart(2, '0')}`;

            const { data: recentMsgs } = await supabase
              .from('whatsapp_messages')
              .select('content, is_from_me, sender_name')
              .eq('lead_id', task.lead_id)
              .is('group_id', null)
              .order('sent_at', { ascending: false })
              .limit(10);

            const leadDisplayName = getLeadDisplayName(task.lead, extractSenderName(recentMsgs));

            const conversationContext = (recentMsgs || [])
              .reverse()
              .map((m: any) => `${m.is_from_me ? 'Vendedor' : leadDisplayName}: ${m.content}`)
              .join('\n');

            // Buscar nome do especialista/closer
            let specialistName = '';
            if (task.responsavel_id) {
              const { data: rep } = await supabase.from('team_members').select('name').eq('id', task.responsavel_id).maybeSingle();
              if (rep?.name) specialistName = rep.name.split(' ')[0];
            }

            const initialPrompt = `você é ${agent.name}. acabou de agendar uma call com o lead. mande uma mensagem curta confirmando.

dados:
- nome do lead: ${leadDisplayName}
- empresa: ${task.lead.company_name || 'não informada'}
- desafios: ${task.lead.challenges || 'não informados'}
- data/hora: ${meetDay}, ${meetTime}h
${specialistName ? `- especialista que vai atender: ${specialistName}` : ''}

contexto da conversa recente:
${conversationContext || '(sem contexto)'}

regras:
- 1-2 frases curtas
- confirme dia e hora
- se tiver desafios, mencione brevemente o que vão conversar
${specialistName ? `- mencione o nome do especialista (${specialistName}) que vai atender` : ''}
- não envie link (vai nos lembretes próximos)

exemplo: "fechou, agendei aqui pra ${meetDay} às ${meetTime}h..${specialistName ? ` o ${specialistName} vai estar te esperando,` : ''} vão conversar sobre como resolver [pain do lead] 🤙"`;

            const { data: llmResponse } = await callLLMForReminder(supabase, agent, initialPrompt);

            if (llmResponse) {
              const parts = splitMessageNaturally(llmResponse);
              for (const part of parts) {
                await sendWhatsAppMessage(instance, task.lead.phone, part, true, supabase, task.lead_id);
                await new Promise(r => setTimeout(r, 1500));
              }

              const updatedMetadata = { ...(task.metadata || {}), reminder_initial_sent: nowISO };
              await supabase
                .from('company_activities')
                .update({ metadata: updatedMetadata })
                .eq('id', task.id);

              await markRecentMessagesAsAI(supabase, task.lead_id, agent.id, agent.name, nowISO);

              try {
                await supabase.from('ai_agent_logs').insert({
                  agent_id: agent.id,
                  lead_id: task.lead_id,
                  log_type: 'call_reminder_initial',
                  data: { task_id: task.id, message: llmResponse, scheduled_at: task.scheduled_at },
                });
              } catch {}

              console.log(`🎉 Confirmação inicial enviada para ${leadDisplayName} - call ${meetDay} ${meetTime}h`);
              processed++;
            }
          } finally {
            try { await supabase.rpc('release_agent_lock', { p_lead_id: task.lead_id }); } catch {}
          }
        } catch (err) {
          console.error(`❌ Erro confirmação inicial task ${task.id}:`, err);
          errors++;
        }
      }
    }

    // ===== 0B. AQUECIMENTO D-3/D-2 (manhã 9h-10h BRT) =====
    // Só envia em D-3 e D-2 (D-1 é coberto pelo lembrete 24h)
    if (brtHour >= 9 && brtHour < 10) {
      // Buscar tarefas futuras (>1 dia) tipo call/meeting com lead+phone
      const dayAfterTomorrow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      dayAfterTomorrow.setUTCHours(0, 0, 0, 0);

      const { data: tasksWarmup } = await supabase
        .from('company_activities')
        .select(`
          id, name, scheduled_at, meeting_link, lead_id, responsavel_id, metadata, description,
          lead:leads!company_activities_lead_id_fkey(id, name, phone, email, instagram, company_name, sales_rep_id, challenges, context)
        `)
        .eq('completed', false)
        .in('task_type', ['meeting', 'call'])
        .gte('scheduled_at', dayAfterTomorrow.toISOString()); // pelo menos 2 dias no futuro

      const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

      for (const task of (tasksWarmup || [])) {
        if (!task.lead?.phone) continue;
        // Se hoje já mandou warmup → skip
        const warmupDays: string[] = task.metadata?.reminder_warmup_days || [];
        if (warmupDays.includes(todayStr)) continue;

        // Calcular dias restantes
        const meetDate = new Date(task.scheduled_at);
        const diffMs = meetDate.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

        // Só enviar em D-3 e D-2 (D-1 é coberto pelo 24h reminder, D-4+ não envia)
        if (daysLeft <= 1 || daysLeft > 3) continue;

        try {
          const { instance, agent } = await getLeadInstanceAndAgent(supabase, task.lead);
          if (!instance || !agent) continue;

          const { data: lockAcquired } = await supabase.rpc('try_acquire_agent_lock', {
            p_lead_id: task.lead_id,
            p_lock_duration: '90 seconds',
          });
          if (!lockAcquired) continue;

          try {
            const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
            const meetDay = dayNames[meetDate.getUTCDay()];
            const meetHour = meetDate.getUTCHours() - 3 < 0 ? meetDate.getUTCHours() + 21 : meetDate.getUTCHours() - 3;
            const meetTime = `${String(meetHour).padStart(2, '0')}:${String(meetDate.getUTCMinutes()).padStart(2, '0')}`;

            const { data: recentMsgs } = await supabase
              .from('whatsapp_messages')
              .select('content, is_from_me, sender_name')
              .eq('lead_id', task.lead_id)
              .is('group_id', null)
              .order('sent_at', { ascending: false })
              .limit(5);

            const leadDisplayName = getLeadDisplayName(task.lead, extractSenderName(recentMsgs));

            const conversationContext = (recentMsgs || [])
              .reverse()
              .map((m: any) => `${m.is_from_me ? 'Vendedor' : leadDisplayName}: ${m.content}`)
              .join('\n');

            const tomReference = daysLeft >= 3
              ? `faltam ${daysLeft} dias pra nossa call de ${meetDay}.. já tô separando umas coisas aqui`
              : `depois de amanhã a gente se fala.. já tô preparando aqui`;

            const warmupPrompt = `você é ${agent.name}. mande uma mensagem curta de aquecimento pro lead sobre a call futura.

dados:
- nome do lead: ${leadDisplayName}
- empresa: ${task.lead.company_name || 'não informada'}
- desafios: ${task.lead.challenges || 'não informados'}
- data/hora: ${meetDay}, ${meetTime}h
- dias restantes: ${daysLeft}

contexto da conversa:
${conversationContext || '(sem contexto)'}

tom sugerido: "${tomReference}"

regras:
- OBRIGATÓRIO: comece a mensagem com o primeiro nome do lead (${leadDisplayName})
- 1-2 frases curtas
- crie antecipação sem ser insistente
- ${daysLeft >= 3 ? 'mencione quantos dias faltam de forma natural' : 'diga que tá se preparando pro papo'}
- se tiver desafios do lead, mencione que vai ajudar com isso
- não peça confirmação (isso é pra 24h antes)
- não envie link
- varie a abordagem
- NUNCA use o email do lead como nome

exemplo: "${leadDisplayName}, ${tomReference} pra te ajudar com [pain do lead]"`;

            const { data: llmResponse } = await callLLMForReminder(supabase, agent, warmupPrompt);

            if (llmResponse) {
              const parts = splitMessageNaturally(llmResponse);
              for (const part of parts) {
                await sendWhatsAppMessage(instance, task.lead.phone, part, true, supabase, task.lead_id);
                await new Promise(r => setTimeout(r, 1500));
              }

              const updatedWarmupDays = [...warmupDays, todayStr];
              const updatedMetadata = { ...(task.metadata || {}), reminder_warmup_days: updatedWarmupDays };
              await supabase
                .from('company_activities')
                .update({ metadata: updatedMetadata })
                .eq('id', task.id);

              await markRecentMessagesAsAI(supabase, task.lead_id, agent.id, agent.name, nowISO);

              try {
                await supabase.from('ai_agent_logs').insert({
                  agent_id: agent.id,
                  lead_id: task.lead_id,
                  log_type: 'call_reminder_warmup',
                  data: { task_id: task.id, message: llmResponse, scheduled_at: task.scheduled_at, days_left: daysLeft },
                });
              } catch {}

              console.log(`☀️ Aquecimento diário enviado para ${leadDisplayName} - call em ${daysLeft} dias`);
              processed++;
            }
          } finally {
            try { await supabase.rpc('release_agent_lock', { p_lead_id: task.lead_id }); } catch {}
          }
        } catch (err) {
          console.error(`❌ Erro aquecimento task ${task.id}:`, err);
          errors++;
        }
      }
    }

    // ===== 1. LEMBRETE 24H ANTES (confirmação) =====
    const window24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
    const window24hEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

    console.log(`🔔 24h window: ${window24hStart} → ${window24hEnd}`);

    const { data: tasks24h, error: err24h } = await supabase
      .from('company_activities')
      .select(`
        id, name, scheduled_at, created_at, meeting_link, lead_id, responsavel_id, metadata, description,
        lead:leads!company_activities_lead_id_fkey(id, name, phone, email, instagram, company_name, sales_rep_id, pipeline_stage_id, pipeline_stage_name, challenges, context)
      `)
      .eq('completed', false)
      .in('task_type', ['meeting', 'call'])
      .gte('scheduled_at', window24hStart)
      .lte('scheduled_at', window24hEnd);

    if (err24h) console.error(`❌ Erro query 24h:`, err24h);
    console.log(`🔔 24h tasks found: ${tasks24h?.length ?? 0}`);

    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    for (const task of (tasks24h || [])) {
      if (task.metadata?.reminder_24h_sent) continue;
      if (!task.lead?.phone) continue;
      // Não confirmar se a tarefa foi criada/agendada há menos de 3h (acabou de agendar)
      if (task.created_at && new Date(task.created_at) > threeHoursAgo) {
        console.log(`⏭️ Lembrete 24h pulado para task ${task.id} — criada há menos de 3h`);
        continue;
      }

      try {
        // Buscar instância e agente do lead
        const { instance, agent } = await getLeadInstanceAndAgent(supabase, task.lead);
        if (!instance || !agent) continue;

        // Lock
        const { data: lockAcquired } = await supabase.rpc('try_acquire_agent_lock', {
          p_lead_id: task.lead_id,
          p_lock_duration: '90 seconds',
        });
        if (!lockAcquired) continue;

        try {
          // Gerar data/hora em BRT
          const meetDate = new Date(task.scheduled_at);
          const brtDate = new Date(meetDate.getTime() - 3 * 60 * 60 * 1000); // UTC→BRT display
          const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
          const meetDay = dayNames[meetDate.getUTCDay()];
          const meetTime = `${String(meetDate.getUTCHours() - 3 < 0 ? meetDate.getUTCHours() + 21 : meetDate.getUTCHours() - 3).padStart(2, '0')}:${String(meetDate.getUTCMinutes()).padStart(2, '0')}`;

          // Buscar últimas mensagens para contexto
          const { data: recentMsgs } = await supabase
            .from('whatsapp_messages')
            .select('content, is_from_me, sender_name')
            .eq('lead_id', task.lead_id)
            .is('group_id', null)
            .order('sent_at', { ascending: false })
            .limit(10);

          const leadName24h = getLeadDisplayName(task.lead, extractSenderName(recentMsgs));

          const conversationContext = (recentMsgs || [])
            .reverse()
            .map((m: any) => `${m.is_from_me ? 'Vendedor' : leadName24h}: ${m.content}`)
            .join('\n');

          // Buscar nome do especialista
          let specialistName24h = '';
          if (task.responsavel_id) {
            const { data: rep } = await supabase.from('team_members').select('name').eq('id', task.responsavel_id).maybeSingle();
            if (rep?.name) specialistName24h = rep.name.split(' ')[0];
          }

          const reminderPrompt = `você é ${agent.name}. mande uma mensagem curta confirmando a call de amanhã.

dados:
- primeiro nome do lead: ${leadName24h}
- empresa: ${task.lead.company_name || 'não informada'}
- data/hora: ${meetDay}, ${meetTime}h (amanhã)
${specialistName24h ? `- especialista: ${specialistName24h}` : ''}

contexto da conversa recente:
${conversationContext || '(sem contexto)'}

regras:
- 1-2 frases curtas
- pergunte se tá confirmado
- se tiver contexto da conversa, referencie algo
${specialistName24h ? `- mencione o ${specialistName24h} como quem vai atender` : ''}
- não envie link (vai no lembrete de 30min)

exemplo: "${leadName24h}, beleza? amanhã às ${meetTime}h temos nossa call..${specialistName24h ? ` o ${specialistName24h} já vai estar preparado..` : ''} tá confirmado?"`;

          const { data: llmResponse } = await callLLMForReminder(supabase, agent, reminderPrompt);

          if (llmResponse) {
            // Enviar via WhatsApp
            const parts = splitMessageNaturally(llmResponse);
            for (const part of parts) {
              await sendWhatsAppMessage(instance, task.lead.phone, part, true, supabase, task.lead_id);
              await new Promise(r => setTimeout(r, 1500));
            }

            // Marcar como enviado
            const updatedMetadata = { ...(task.metadata || {}), reminder_24h_sent: nowISO };
            await supabase
              .from('company_activities')
              .update({ metadata: updatedMetadata })
              .eq('id', task.id);

            // Marcar msgs como IA
            await markRecentMessagesAsAI(supabase, task.lead_id, agent.id, agent.name, nowISO);

            // Log
            try {
              await supabase.from('ai_agent_logs').insert({
                agent_id: agent.id,
                lead_id: task.lead_id,
                log_type: 'call_reminder_24h',
                data: { task_id: task.id, message: llmResponse, scheduled_at: task.scheduled_at },
              });
            } catch {}

            console.log(`📅 Lembrete 24h enviado para ${leadName24h} - call ${meetDay} ${meetTime}h`);
            processed++;
          }
        } finally {
          try { await supabase.rpc('release_agent_lock', { p_lead_id: task.lead_id }); } catch {}
        }
      } catch (err) {
        console.error(`❌ Erro lembrete 24h task ${task.id}:`, err);
        errors++;
      }
    }

    // ===== 1B. LEMBRETE "É HOJE" (7:00-8:00 BRT = 10:00-11:00 UTC) =====
    console.log(`🔔 "é hoje" check: brtHour=${brtHour}, eligible=${brtHour >= 7 && brtHour < 8}`);
    if (brtHour >= 7 && brtHour < 8) {
      // Buscar tarefas agendadas para HOJE com lead+phone
      const todayStartUTC = new Date(now);
      todayStartUTC.setUTCHours(0, 0, 0, 0);
      const todayEndUTC = new Date(now);
      todayEndUTC.setUTCHours(23, 59, 59, 999);

      const { data: tasksToday, error: errToday } = await supabase
        .from('company_activities')
        .select(`
          id, name, scheduled_at, created_at, meeting_link, lead_id, responsavel_id, metadata, description, confirmed_by_client,
          lead:leads!company_activities_lead_id_fkey(id, name, phone, email, instagram, company_name, sales_rep_id, challenges, context)
        `)
        .eq('completed', false)
        .in('task_type', ['meeting', 'call'])
        .gte('scheduled_at', todayStartUTC.toISOString())
        .lte('scheduled_at', todayEndUTC.toISOString());

      if (errToday) console.error(`❌ Erro query "é hoje":`, errToday);
      console.log(`🔔 "é hoje" tasks found: ${tasksToday?.length ?? 0}`, tasksToday?.map((t: any) => ({ id: t.id, name: t.name, lead: t.lead?.name, phone: !!t.lead?.phone })));

      const threeHoursAgoToday = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      for (const task of (tasksToday || [])) {
        if (task.metadata?.reminder_today_sent) { console.log(`⏭️ "é hoje" skip ${task.name}: already sent`); continue; }
        if (!task.lead?.phone) { console.log(`⏭️ "é hoje" skip ${task.name}: no phone`); continue; }
        // Não confirmar se a tarefa foi criada/agendada há menos de 3h
        if (task.created_at && new Date(task.created_at) > threeHoursAgoToday) {
          console.log(`⏭️ Lembrete "é hoje" pulado para task ${task.id} — criada há menos de 3h`);
          continue;
        }
        // Se o lead já confirmou, pular "é hoje" (só manda o de 30min)
        if (task.metadata?.confirmed_by_client || task.confirmed_by_client) {
          console.log(`⏭️ Lembrete "é hoje" pulado para task ${task.id} — lead já confirmou, só 30min`);
          const updatedMetadata = { ...(task.metadata || {}), reminder_today_sent: nowISO, skipped_reason: 'confirmed_by_client' };
          await supabase.from('company_activities').update({ metadata: updatedMetadata }).eq('id', task.id);
          continue;
        }

        try {
          const { instance, agent } = await getLeadInstanceAndAgent(supabase, task.lead);
          if (!instance || !agent) { console.log(`⏭️ "é hoje" skip ${task.name}: instance=${!!instance}, agent=${!!agent}`); continue; }

          const { data: lockAcquired } = await supabase.rpc('try_acquire_agent_lock', {
            p_lead_id: task.lead_id,
            p_lock_duration: '90 seconds',
          });
          if (!lockAcquired) { console.log(`⏭️ "é hoje" skip ${task.name}: lock not acquired`); continue; }

          try {
            const meetDate = new Date(task.scheduled_at);
            const meetHour = meetDate.getUTCHours() - 3 < 0 ? meetDate.getUTCHours() + 21 : meetDate.getUTCHours() - 3;
            const meetTime = `${String(meetHour).padStart(2, '0')}:${String(meetDate.getUTCMinutes()).padStart(2, '0')}`;

            // Buscar sender_name do WhatsApp para nome correto
            const { data: senderMsgs } = await supabase.from('whatsapp_messages')
              .select('sender_name').eq('lead_id', task.lead_id).eq('is_from_me', false)
              .not('sender_name', 'is', null).limit(1);
            const leadName = getLeadDisplayName(task.lead, senderMsgs?.[0]?.sender_name);

            const todayPrompt = `você é ${agent.name}. mande um bom dia confirmando a reunião de hoje.

dados:
- primeiro nome do lead: ${leadName}
- horário: ${meetTime}h (hoje)

regras:
- 1-2 frases curtas e naturais
- cumprimente com bom dia + nome
- confirme que a reunião é hoje e mencione o horário
- pergunte se tá confirmado
- não envie link (vai no lembrete de 30min)

exemplo: "bom dia ${leadName}! confirmado hoje nossa reunião às ${meetTime}h?"
exemplo2: "${leadName}, bom dia! hoje às ${meetTime}h temos nossa call.. tá confirmado?"`;


            const { data: llmResponse } = await callLLMForReminder(supabase, agent, todayPrompt);

            if (llmResponse) {
              const parts = splitMessageNaturally(llmResponse);
              for (const part of parts) {
                await sendWhatsAppMessage(instance, task.lead.phone, part, true, supabase, task.lead_id);
                await new Promise(r => setTimeout(r, 1500));
              }

              const updatedMetadata = { ...(task.metadata || {}), reminder_today_sent: nowISO };
              await supabase
                .from('company_activities')
                .update({ metadata: updatedMetadata })
                .eq('id', task.id);

              await markRecentMessagesAsAI(supabase, task.lead_id, agent.id, agent.name, nowISO);

              try {
                await supabase.from('ai_agent_logs').insert({
                  agent_id: agent.id,
                  lead_id: task.lead_id,
                  log_type: 'call_reminder_today',
                  data: { task_id: task.id, message: llmResponse, scheduled_at: task.scheduled_at },
                });
              } catch {}

              console.log(`☀️ Lembrete "é hoje" enviado para ${leadName} - call às ${meetTime}h`);
              processed++;
            }
          } finally {
            try { await supabase.rpc('release_agent_lock', { p_lead_id: task.lead_id }); } catch {}
          }
        } catch (err) {
          console.error(`❌ Erro lembrete "é hoje" task ${task.id}:`, err);
          errors++;
        }
      }
    }

    // ===== 2D. LEMBRETE 30MIN ANTES (com link) =====
    const window30minStart = new Date(now.getTime() + 25 * 60 * 1000).toISOString();
    const window30minEnd = new Date(now.getTime() + 35 * 60 * 1000).toISOString();

    console.log(`🔔 30min window: ${window30minStart} → ${window30minEnd}`);

    const { data: tasks30min, error: err30min } = await supabase
      .from('company_activities')
      .select(`
        id, name, scheduled_at, meeting_link, lead_id, responsavel_id, metadata, description,
        lead:leads!company_activities_lead_id_fkey(id, name, phone, email, instagram, company_name, challenges, context, sales_rep_id)
      `)
      .eq('completed', false)
      .in('task_type', ['meeting', 'call'])
      .gte('scheduled_at', window30minStart)
      .lte('scheduled_at', window30minEnd);

    if (err30min) console.error(`❌ Erro query 30min:`, err30min);
    console.log(`🔔 30min tasks found: ${tasks30min?.length ?? 0}`);

    for (const task of (tasks30min || [])) {
      if (task.metadata?.reminder_30min_sent) { console.log(`⏭️ 30min skip ${task.name}: already sent`); continue; }
      if (!task.lead?.phone) { console.log(`⏭️ 30min skip ${task.name}: no phone`); continue; }

      try {
        const { instance, agent } = await getLeadInstanceAndAgent(supabase, task.lead);
        if (!instance || !agent) { console.log(`⏭️ 30min skip ${task.name}: instance=${!!instance}, agent=${!!agent}`); continue; }

        const { data: lockAcquired } = await supabase.rpc('try_acquire_agent_lock', {
          p_lead_id: task.lead_id,
          p_lock_duration: '90 seconds',
        });
        if (!lockAcquired) { console.log(`⏭️ 30min skip ${task.name}: lock not acquired`); continue; }

        try {
          const meetDate = new Date(task.scheduled_at);
          const meetHour = meetDate.getUTCHours() - 3 < 0 ? meetDate.getUTCHours() + 21 : meetDate.getUTCHours() - 3;
          const meetTime = `${String(meetHour).padStart(2, '0')}:${String(meetDate.getUTCMinutes()).padStart(2, '0')}`;
          const meetingLink = task.meeting_link || '';

          // Buscar nome do especialista
          let specialistName30min = '';
          if (task.responsavel_id) {
            const { data: rep } = await supabase.from('team_members').select('name').eq('id', task.responsavel_id).maybeSingle();
            if (rep?.name) specialistName30min = rep.name.split(' ')[0];
          }

          const { data: senderMsgs30 } = await supabase.from('whatsapp_messages')
            .select('sender_name').eq('lead_id', task.lead_id).eq('is_from_me', false)
            .not('sender_name', 'is', null).limit(1);
          const leadName30min = getLeadDisplayName(task.lead, senderMsgs30?.[0]?.sender_name);

          const reminder30minPrompt = `você é ${agent.name}. lembrete da call em 30 minutos.

dados:
- primeiro nome do lead: ${leadName30min}
- horário: ${meetTime}h (daqui 30 minutos)
${specialistName30min ? `- especialista: ${specialistName30min}` : ''}

regras:
- 1-2 frases curtas
- NUNCA envie links de reunião (o link é enviado separadamente pelo sistema)
${specialistName30min ? `- mencione que o ${specialistName30min} já tá preparado` : ''}

exemplo: "${leadName30min}, daqui 30min é nossa call..${specialistName30min ? ` o ${specialistName30min}` : ''} já tá te esperando aqui"`;

          const { data: llmResponse } = await callLLMForReminder(supabase, agent, reminder30minPrompt);

          if (llmResponse) {
            const parts = splitMessageNaturally(llmResponse);
            for (const part of parts) {
              await sendWhatsAppMessage(instance, task.lead.phone, part, true, supabase, task.lead_id);
              await new Promise(r => setTimeout(r, 1500));
            }

            const updatedMetadata = { ...(task.metadata || {}), reminder_30min_sent: nowISO };
            await supabase
              .from('company_activities')
              .update({ metadata: updatedMetadata })
              .eq('id', task.id);

            await markRecentMessagesAsAI(supabase, task.lead_id, agent.id, agent.name, nowISO);

            try {
              await supabase.from('ai_agent_logs').insert({
                agent_id: agent.id,
                lead_id: task.lead_id,
                log_type: 'call_reminder_30min',
                data: { task_id: task.id, message: llmResponse, scheduled_at: task.scheduled_at, has_link: !!meetingLink },
              });
            } catch {}

            console.log(`⏰ Lembrete 30min enviado para ${leadName30min} - call às ${meetTime}h`);
            processed++;
          }
        } finally {
          try { await supabase.rpc('release_agent_lock', { p_lead_id: task.lead_id }); } catch {}
        }
      } catch (err) {
        console.error(`❌ Erro lembrete 30min task ${task.id}:`, err);
        errors++;
      }
    }

    // ===== 3. NO-SHOW HANDLER: REMOVIDO =====
    // Bloco removido — mandava msg + movia lead pra "no_show" automaticamente sem configuração.
    // Se precisar no futuro, deve ser configurável nas settings do agente.
  } catch (err: any) {
    console.error('❌ Erro geral processCallReminders:', err?.message || err);
    errors++;
  }

  console.log(`📅 Call Reminders: ${processed} enviados, ${errors} erros`);
  return { processed, errors };
}

/**
 * Helper: busca instância WhatsApp e agente IA do lead
 */
async function getLeadInstanceAndAgent(supabase: any, lead: any): Promise<{ instance: any; agent: any }> {
  // Buscar agente ativo — rotear por instance_id da última msg do lead
  const { data: lastMsgForRouting } = await supabase
    .from('whatsapp_messages')
    .select('instance_id')
    .eq('lead_id', lead.id)
    .is('group_id', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let agent: any = null;

  // Tentar rotear pelo instance_id
  if (lastMsgForRouting?.instance_id) {
    const { data: matchedAgent } = await supabase
      .from('ai_sales_agents')
      .select('*')
      .eq('is_active', true)
      .eq('instance_id', lastMsgForRouting.instance_id)
      .limit(1)
      .maybeSingle();
    if (matchedAgent) agent = matchedAgent;
  }

  // Fallback: primeiro agente ativo
  if (!agent) {
    const { data: fallbackAgent } = await supabase
      .from('ai_sales_agents')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    agent = fallbackAgent;
  }

  if (!agent) return { instance: null, agent: null };

  // Buscar instância — SEMPRE usar a do agente (Cloud API)
  // NÃO usar instância do vendedor (UAZAPI) pra cadências automáticas — risco de bloqueio
  const instanceId = agent.instance_id;

  if (!instanceId) return { instance: null, agent };

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('id, name, status, api_key, api_url, metadata')
    .eq('id', instanceId)
    .maybeSingle();

  // Cloud API não precisa de status check (é oficial, sempre conectada)
  if (instance && instance.status !== 'connected' && instance.metadata?.type !== 'cloud_api') {
    return { instance: null, agent };
  }

  return { instance, agent };
}

/**
 * Helper: Chama LLM de forma simples (sem tools, sem histórico) para gerar mensagens de lembrete
 */
async function callLLMForReminder(supabase: any, agent: any, prompt: string): Promise<{ data: string | null }> {
  // System prompt que define o tom obrigatório de TODAS as mensagens de lembrete
  const REMINDER_TONE_SYSTEM = `você é um vendedor real mandando mensagem no whatsapp. siga estas regras de tom RIGOROSAMENTE:

REGRAS DE ESCRITA (OBRIGATÓRIAS):
- tudo minúsculo sempre. nunca comece frase com maiúscula.
- zero emoji ou no máximo 1 emoji discreto no FINAL da mensagem (tipo 🤙 ou 😄). nunca use 👋🚀🎉🔥💪 ou similares.
- nunca use "!" — quando quiser pausar use ".." (dois pontos)
- nunca use linguagem de chatbot/robô como "Estou aqui para", "Gostaria de", "Informo que"
- nunca use "prezado", "caro", "informamos", "gostaríamos"
- nunca use gírias exageradas como "massa!", "show!", "arrasou!"
- tom de parceiro que manja do assunto, não de assistente
- frases curtas, diretas, como conversa real entre duas pessoas
- pode usar "blz", "beleza", "tamo junto", "fechou" de forma natural
- referencie o especialista/closer pelo nome quando tiver

ERRADO (nunca faça isso):
- "👋 Só passando para lembrar que hoje às 15:30h temos nossa reunião — até mais tarde!"
- "🚀 Te ligo às 15:30h, tô aqui animado e pronto pra nossa conversa!"
- "Olá! Tudo bem? Gostaria de confirmar nossa reunião."

CERTO (faça assim):
- "vou confirmar o agendamento pra amanhã às 15h30.. qual seu email pra eu mandar o invite?"
- "nosso especialista já vai estar preparado pro papo 🤙"
- "amanhã tem horário sim.. fica melhor de manhã ou à tarde?"
- "fulano, beleza? amanhã às 16h30 temos nossa call.. tá confirmado?"
- "bom dia fulano.. só lembrando que hoje às 15h30 a gente se fala"

responda APENAS com a mensagem, sem explicações.`;

  try {
    // Le das vars globais hidratadas no handler (_shared/config.ts).
    const apiKey = agent.model?.startsWith('gpt') ? OPENAI_API_KEY : ANTHROPIC_API_KEY;

    if (agent.model?.startsWith('gpt')) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: agent.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: REMINDER_TONE_SYSTEM },
            { role: 'user', content: prompt },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });
      const json = await response.json();
      return { data: json.choices?.[0]?.message?.content || null };
    } else {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey!,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(sanitizeForJSON({
          model: agent.model || 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          temperature: 0.7,
          system: REMINDER_TONE_SYSTEM,
          messages: [{ role: 'user', content: prompt }],
        })),
      });
      const json = await response.json();
      return { data: json.content?.[0]?.text || null };
    }
  } catch (err) {
    console.error('❌ callLLMSimple error:', err);
    return { data: null };
  }
}

/**
 * Processador principal de cadências - chamado pelo cron a cada minuto
 */
async function processCadence(supabase: any): Promise<{ processed: number; errors: number }> {
  // Buscar settings globais para batch size
  const { data: globalAgent } = await supabase
    .from('ai_sales_agents')
    .select('id, settings')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const globalCadenceSettings = mergeSettings(globalAgent?.settings);

  // === REPROCESSAR CONVERSAS PAUSADAS POR HORÁRIO ===
  // Quando mensagens chegam fora do horário, ficam paused_by_schedule.
  // Aqui reativamos e reprocessamos quando o horário volta.
  if (globalAgent && isWithinWorkingHours(globalCadenceSettings)) {
    try {
      const { data: pausedConvs } = await supabase
        .from('ai_agent_conversations')
        .select('id, lead_id, agent_id')
        .eq('status', 'paused_by_schedule')
        .limit(5);

      if (pausedConvs && pausedConvs.length > 0) {
        console.log(`🕐 Reprocessando ${pausedConvs.length} conversas pausadas por horário`);

        for (const conv of pausedConvs) {
          try {
            // Buscar última mensagem não respondida do lead
            const { data: lastLeadMsg } = await supabase
              .from('whatsapp_messages')
              .select('content, sent_at')
              .eq('lead_id', conv.lead_id)
              .eq('is_from_me', false)
              .is('group_id', null)
              .order('sent_at', { ascending: false })
              .limit(1)
              .single();

            // Verificar se a última msg do lead não foi respondida
            const { data: lastOurMsg } = await supabase
              .from('whatsapp_messages')
              .select('sent_at')
              .eq('lead_id', conv.lead_id)
              .eq('is_from_me', true)
              .is('group_id', null)
              .order('sent_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            // Reativar conversa
            await supabase
              .from('ai_agent_conversations')
              .update({ status: 'active', updated_at: new Date().toISOString() })
              .eq('id', conv.id);

            // Se lead mandou msg depois da nossa última → reprocessar
            if (lastLeadMsg && (!lastOurMsg || new Date(lastLeadMsg.sent_at) > new Date(lastOurMsg.sent_at))) {
              console.log(`📨 Reprocessando msg pendente do lead ${conv.lead_id}: "${(lastLeadMsg.content || '').substring(0, 50)}"`);

              // Chamar processLeadMessage internamente
              await processLeadMessage(supabase, {
                lead_id: conv.lead_id,
                message_content: lastLeadMsg.content || '',
                conversation_id: conv.id,
              });
            } else {
              console.log(`✅ Conversa ${conv.id} reativada (sem msg pendente)`);
            }
          } catch (convErr) {
            console.error(`⚠️ Erro ao reprocessar conversa pausada ${conv.id}:`, convErr);
          }
        }
      }
    } catch (schedErr) {
      console.error('⚠️ Erro ao buscar conversas paused_by_schedule:', schedErr);
    }
  }

  // === RECUPERAR MENSAGENS ÓRFÃS (lead enviou msg mas agente nunca respondeu) ===
  if (globalAgent && isWithinWorkingHours(globalCadenceSettings)) {
    try {
      // Buscar conversas ativas com lock expirado (>60s) ou sem lock
      const lockExpiry = new Date(Date.now() - 60 * 1000).toISOString(); // 60s de margem

      const { data: activeConvs } = await supabase
        .from('ai_agent_conversations')
        .select('id, lead_id, agent_id, last_processed_at, processing_lock')
        .eq('status', 'active')
        .or(`processing_lock.is.null,processing_lock.lt.${lockExpiry}`)
        .limit(10);

      if (activeConvs && activeConvs.length > 0) {
        for (const conv of activeConvs) {
          try {
            // FIX: Buscar instance_id do agente pra filtrar msgs da instância correta
            const { data: convAgent } = await supabase
              .from('ai_sales_agents')
              .select('instance_id')
              .eq('id', conv.agent_id)
              .maybeSingle();
            const agentInstanceId = convAgent?.instance_id;

            // Buscar última msg do lead DEPOIS do last_processed_at (ou qualquer msg se nunca processou)
            let orphanQuery = supabase
              .from('whatsapp_messages')
              .select('id, content, sent_at')
              .eq('lead_id', conv.lead_id)
              .eq('is_from_me', false)
              .is('group_id', null)
              .order('sent_at', { ascending: false })
              .limit(1);

            // FIX: Filtrar pela instância do agente (multi-pipeline isolation)
            if (agentInstanceId) {
              orphanQuery = orphanQuery.eq('instance_id', agentInstanceId);
            }

            if (conv.last_processed_at) {
              orphanQuery = orphanQuery.gt('sent_at', conv.last_processed_at);
            }

            const { data: orphanMsg } = await orphanQuery.maybeSingle();

            if (!orphanMsg) continue;

            // Verificar que a msg órfã tem pelo menos 60s (evitar reprocessar msg em andamento)
            const msgAge = Date.now() - new Date(orphanMsg.sent_at).getTime();
            if (msgAge < 120000) continue; // 120s — dar tempo pro process_with_debounce completar

            // SKIP se lead tem items pendentes na fila (a fila vai processar)
            const { data: pendingQueueItem } = await supabase
              .from('ai_agent_message_queue')
              .select('id')
              .eq('lead_id', conv.lead_id)
              .eq('status', 'pending')
              .limit(1)
              .maybeSingle();

            if (pendingQueueItem) {
              console.log(`⏭️ Lead ${conv.lead_id} tem item pendente na fila — orphan recovery pula (fila vai tratar)`);
              continue;
            }

            // Verificar que NÃO temos msg do agente depois da msg do lead
            // FIX: filtrar pela instância do agente
            let agentReplyQuery = supabase
              .from('whatsapp_messages')
              .select('id')
              .eq('lead_id', conv.lead_id)
              .eq('is_from_me', true)
              .is('group_id', null)
              .gt('sent_at', orphanMsg.sent_at)
              .limit(1);
            if (agentInstanceId) {
              agentReplyQuery = agentReplyQuery.eq('instance_id', agentInstanceId);
            }
            const { data: agentReply } = await agentReplyQuery.maybeSingle();

            if (agentReply) continue; // Agente já respondeu

            console.log(`🔄 Mensagem órfã detectada para lead ${conv.lead_id}: "${(orphanMsg.content || '').substring(0, 50)}" (${Math.round(msgAge / 1000)}s atrás)`);

            // NÃO fazer release manual do lock aqui!
            // processLeadMessage vai tentar adquirir o lock atomicamente.
            // Se o lock ainda está ativo (outra instância processando), processLeadMessage retorna sem enviar.
            // Se o lock expirou, processLeadMessage adquire um novo automaticamente.

            // Reprocessar a mensagem — FIX: filtrar pela instância do agente
            let pendingMsgsQuery = supabase
              .from('whatsapp_messages')
              .select('content')
              .eq('lead_id', conv.lead_id)
              .eq('is_from_me', false)
              .is('group_id', null)
              .order('sent_at', { ascending: true });
            if (agentInstanceId) {
              pendingMsgsQuery = pendingMsgsQuery.eq('instance_id', agentInstanceId);
            }

            if (conv.last_processed_at) {
              pendingMsgsQuery = pendingMsgsQuery.gt('sent_at', conv.last_processed_at);
            }

            const allPendingMsgs = await pendingMsgsQuery;

            const combinedContent = (allPendingMsgs.data || [])
              .map((m: any) => m.content)
              .filter((c: any) => c)
              .join('\n');

            if (combinedContent.trim()) {
              await processLeadMessage(supabase, {
                lead_id: conv.lead_id,
                message_content: combinedContent,
                conversation_id: conv.id,
              });
              // Marcar queue items pendentes como completed (evitar processamento duplo)
              await supabase
                .from('ai_agent_message_queue')
                .update({ status: 'completed', processed_at: new Date().toISOString(), result: { skipped: 'processed_by_orphan_recovery' } })
                .eq('lead_id', conv.lead_id)
                .eq('status', 'pending');
              processed++;
              console.log(`✅ Mensagem órfã reprocessada com sucesso para lead ${conv.lead_id}`);
            }
          } catch (orphanErr: any) {
            console.error(`⚠️ Erro ao recuperar msg órfã para conv ${conv.id}:`, orphanErr.message || orphanErr);
          }
        }
      }
    } catch (orphanErr) {
      console.error('⚠️ Erro na detecção de mensagens órfãs:', orphanErr);
    }
  }

  // === DETECTAR CONVERSAS GHOST (>24h sem resposta) → criar follow-up automático ===
  if (globalAgent && isWithinWorkingHours(globalCadenceSettings)) {
    try {
      const ghostThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: ghostConvs } = await supabase
        .from('ai_agent_conversations')
        .select('id, lead_id, agent_id')
        .eq('status', 'active')
        .lt('last_processed_at', ghostThreshold)
        .limit(5);

      if (ghostConvs && ghostConvs.length > 0) {
        for (const conv of ghostConvs) {
          try {
            // Check if there's already a pending/processing/recent followup
            const { data: existingFu } = await supabase
              .from('ai_agent_scheduled_followups')
              .select('id, status')
              .eq('lead_id', conv.lead_id)
              .in('status', ['pending', 'processing'])
              .limit(1)
              .maybeSingle();

            if (existingFu) continue;

            // Also check if a follow-up was sent in the last 4 hours (don't create another)
            const recentFuCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
            const { data: recentSentFu } = await supabase
              .from('ai_agent_scheduled_followups')
              .select('id')
              .eq('lead_id', conv.lead_id)
              .eq('status', 'sent')
              .gt('updated_at', recentFuCutoff)
              .limit(1)
              .maybeSingle();

            if (recentSentFu) {
              console.log(`⏭️ Lead ${conv.lead_id} já recebeu follow-up recente, ignorando ghost`);
              continue;
            }

            // Check that last message was from agent (not from lead waiting for reply)
            const { data: lastMsg } = await supabase
              .from('whatsapp_messages')
              .select('is_from_me, sent_at')
              .eq('lead_id', conv.lead_id)
              .is('group_id', null)
              .order('sent_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!lastMsg || !lastMsg.is_from_me) continue;

            // Verify enrollment is in 'replied' status (lead was engaged)
            const { data: repliedEnroll } = await supabase
              .from('ai_agent_cadence_enrollments')
              .select('id')
              .eq('lead_id', conv.lead_id)
              .eq('status', 'replied')
              .limit(1)
              .maybeSingle();

            if (!repliedEnroll) continue;

            // Check max 2 auto follow-ups (don't spam)
            const { data: prevFollowups } = await supabase
              .from('ai_agent_scheduled_followups')
              .select('id')
              .eq('lead_id', conv.lead_id)
              .eq('status', 'sent')
              .limit(3);

            if (prevFollowups && prevFollowups.length >= 2) {
              console.log(`⏭️ Lead ${conv.lead_id} já recebeu 2+ follow-ups, ignorando ghost`);
              continue;
            }

            console.log(`👻 Ghost detectado para lead ${conv.lead_id} - criando follow-up automático`);

            await supabase
              .from('ai_agent_scheduled_followups')
              .insert({
                lead_id: conv.lead_id,
                conversation_id: conv.id,
                agent_id: conv.agent_id,
                scheduled_at: new Date().toISOString(),
                context_note: 'Follow-up automático: lead ficou >24h sem responder após conversa ativa.',
                status: 'pending',
              });
          } catch (ghostConvErr) {
            console.error(`⚠️ Erro ao verificar ghost ${conv.id}:`, ghostConvErr);
          }
        }
      }
    } catch (ghostErr) {
      console.error('⚠️ Erro na detecção de ghost:', ghostErr);
    }
  }

  // === PROCESSAR FOLLOW-UPS AGENDADOS (scheduled + ghost-created) ===
  // Usa claim atômico com FOR UPDATE SKIP LOCKED para evitar duplicação
  if (globalAgent && isWithinWorkingHours(globalCadenceSettings)) {
    try {
      const { data: dueFollowups, error: claimErr } = await supabase.rpc('claim_scheduled_followups', {
        p_batch_size: 5,
      });

      if (claimErr) {
        console.error('⚠️ Erro ao claimar follow-ups:', claimErr);
      } else if (dueFollowups && dueFollowups.length > 0) {
        console.log(`📅 Processando ${dueFollowups.length} follow-ups agendados (claimed)`);

        for (const followup of dueFollowups) {
          try {
            const sent = await executeScheduledFollowup(supabase, followup, globalAgent);
            if (sent) {
              processed++;
            } else {
              // SAFETY: Verificar status atual antes de sobrescrever
              const { data: currentFu } = await supabase
                .from('ai_agent_scheduled_followups')
                .select('status, attempts')
                .eq('id', followup.id)
                .maybeSingle();
              if (currentFu?.status === 'sent' || currentFu?.status === 'cancelled') {
                console.log(`⏭️ Follow-up ${followup.id} já ${currentFu.status} internamente`);
                if (currentFu.status === 'sent') processed++;
              } else {
                const currentAttempts = (currentFu?.attempts || followup.attempts || 0) + 1;
                if (currentAttempts >= 3) {
                  console.warn(`🛑 Follow-up ${followup.id} falhou ${currentAttempts}x — cancelando`);
                  await supabase
                    .from('ai_agent_scheduled_followups')
                    .update({ status: 'cancelled', attempts: currentAttempts, updated_at: new Date().toISOString() })
                    .eq('id', followup.id);
                } else {
                  await supabase
                    .from('ai_agent_scheduled_followups')
                    .update({ status: 'pending', attempts: currentAttempts, updated_at: new Date().toISOString() })
                    .eq('id', followup.id);
                }
              }
            }
          } catch (fuErr) {
            console.error(`⚠️ Erro no follow-up ${followup.id}:`, fuErr);
            // SAFETY: Verificar status atual antes de sobrescrever (não desfazer 'sent')
            const { data: currentFu } = await supabase
              .from('ai_agent_scheduled_followups')
              .select('status, attempts')
              .eq('id', followup.id)
              .maybeSingle();
            if (currentFu?.status === 'sent' || currentFu?.status === 'cancelled') {
              console.log(`⏭️ Follow-up ${followup.id} já está ${currentFu.status}, não sobrescrever`);
            } else {
              const currentAttempts = (currentFu?.attempts || followup.attempts || 0) + 1;
              if (currentAttempts >= 3) {
                console.warn(`🛑 Follow-up ${followup.id} atingiu ${currentAttempts} tentativas — cancelando`);
                await supabase
                  .from('ai_agent_scheduled_followups')
                  .update({ status: 'cancelled', attempts: currentAttempts, updated_at: new Date().toISOString() })
                  .eq('id', followup.id);
              } else {
                await supabase
                  .from('ai_agent_scheduled_followups')
                  .update({ status: 'pending', attempts: currentAttempts, updated_at: new Date().toISOString() })
                  .eq('id', followup.id);
              }
            }
          }
        }
      }
    } catch (fuErr) {
      console.error('⚠️ Erro ao buscar follow-ups agendados:', fuErr);
    }
  }

  const batchSize = globalCadenceSettings.cadence_batch_size;

  // Buscar enrollments ativos com next_action_at <= agora (batch limitado)
  const { data: enrollments, error } = await supabase
    .from('ai_agent_cadence_enrollments')
    .select('*')
    .eq('status', 'active')
    .lte('next_action_at', new Date().toISOString())
    .order('next_action_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    console.error('❌ Erro ao buscar cadence enrollments:', error);
    return { processed: 0, errors: 1 };
  }

  let processed = 0;
  let errors = 0;
  let rateLimitHit = false;

  if (!enrollments || enrollments.length === 0) {
    console.log('📋 Nenhum enrollment ativo para processar, verificando reativações...');
  } else {
    console.log(`📋 Processando ${enrollments.length} cadence enrollments (batch: ${batchSize})`);

  for (const enrollment of enrollments as CadenceEnrollment[]) {
    try {
      // Lock otimista: empurrar next_action_at pra frente antes de processar
      // Se outra instância já empurrou, a condição lte não bate e retorna null
      const { data: claimed } = await supabase
        .from('ai_agent_cadence_enrollments')
        .update({ next_action_at: new Date(Date.now() + 3 * 60 * 1000).toISOString() })
        .eq('id', enrollment.id)
        .eq('status', 'active')
        .lte('next_action_at', new Date().toISOString())
        .select('id')
        .maybeSingle();

      if (!claimed) {
        console.log(`⏭️ Enrollment ${enrollment.id} já sendo processado por outra instância`);
        continue;
      }

      // Buscar agente com cadence_steps
      const { data: agent } = await supabase
        .from('ai_sales_agents')
        .select('*')
        .eq('id', enrollment.agent_id)
        .eq('is_active', true)
        .single();

      if (!agent) {
        console.log(`⏭️ Agente ${enrollment.agent_id} inativo, cancelando enrollment`);
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        continue;
      }

      const settings = mergeSettings(agent.settings);

      // Verificar horário de trabalho
      if (!isWithinWorkingHours(settings)) {
        console.log(`⏭️ Fora do horário de trabalho, pulando enrollment ${enrollment.id}`);
        continue;
      }

      // Hard limit: cadências de sequência (no-show, reengajamento) só 08-21h BRT
      const isSequenceStage = enrollment.stage.startsWith('No-show') || enrollment.stage === 'Reengajamento';
      if (isSequenceStage) {
        const nowBRT_seq = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const hourBRT_seq = nowBRT_seq.getHours();
        if (hourBRT_seq < 8 || hourBRT_seq >= 21) {
          // Reagendar para 08:00 BRT do próximo dia útil
          const tomorrow8am = new Date(nowBRT_seq);
          tomorrow8am.setDate(tomorrow8am.getDate() + 1);
          tomorrow8am.setHours(8, 0, 0, 0);
          const nextActionUTC = new Date(tomorrow8am.getTime() + 3 * 60 * 60 * 1000).toISOString();
          console.log(`⏭️ Sequência ${enrollment.stage} fora do horário (${hourBRT_seq}h BRT), reagendando para 08:00`);
          await supabase
            .from('ai_agent_cadence_enrollments')
            .update({ next_action_at: nextActionUTC, updated_at: new Date().toISOString() })
            .eq('id', enrollment.id);
          continue;
        }
      }

      // Buscar steps do estágio
      const stageSteps: CadenceStep[] = agent.cadence_steps?.[enrollment.stage] || [];
      if (stageSteps.length === 0) {
        console.log(`⏭️ Nenhum step para estágio ${enrollment.stage}`);
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        continue;
      }

      // Verificar se current_step é válido
      if (enrollment.current_step >= stageSteps.length) {
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        continue;
      }

      const currentStep = stageSteps[enrollment.current_step];

      // GUARD: Se o agente já enviou msg recente pro lead (últimas 2h), adiar cadência
      // Evita duplicação quando enrollment é criado no meio de conversa ativa (ex: qualify_lead move stage)
      // MULTI-PIPELINE: só checar msgs DEPOIS do enrolled_at — msgs anteriores são de outra cadência/contexto
      if (enrollment.current_step === 0) {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const checkSince = enrollment.enrolled_at > twoHoursAgo ? twoHoursAgo : enrollment.enrolled_at;
        let recentAgentQuery = supabase
          .from('whatsapp_messages')
          .select('id, sent_at')
          .eq('lead_id', enrollment.lead_id)
          .eq('is_from_me', true)
          .is('group_id', null)
          .gt('sent_at', enrollment.enrolled_at)
          .not('content', 'like', '🔧%')
          .order('sent_at', { ascending: false })
          .limit(1);
        if (agent.instance_id) {
          recentAgentQuery = recentAgentQuery.eq('instance_id', agent.instance_id);
        }
        const { data: recentAgentMsg } = await recentAgentQuery.maybeSingle();

        if (recentAgentMsg) {
          // Adiar para 2h após a última msg do agente (dar tempo do lead responder)
          const lastMsgTime = new Date(recentAgentMsg.sent_at).getTime();
          const newNextAction = new Date(lastMsgTime + 2 * 60 * 60 * 1000).toISOString();
          console.log(`⏸️ Cadência ${enrollment.id} adiada — agente enviou msg recente (${recentAgentMsg.sent_at}). Próxima tentativa: ${newNextAction}`);
          await supabase
            .from('ai_agent_cadence_enrollments')
            .update({ next_action_at: newNextAction, updated_at: new Date().toISOString() })
            .eq('id', enrollment.id);
          continue;
        }
      }

      // GUARD: Se um HUMANO mandou msg recente pro lead (últimas 6h) NA MESMA INSTÂNCIA, adiar cadência
      // Evita agente interferir quando closer está trabalhando o lead ativamente
      // MULTI-PIPELINE: filtrar por instância do agente + depois do enrolled_at
      {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        let humanQuery = supabase
          .from('whatsapp_messages')
          .select('id, sent_at')
          .eq('lead_id', enrollment.lead_id)
          .eq('is_from_me', true)
          .is('group_id', null)
          .gt('sent_at', sixHoursAgo)
          .is('metadata->sent_by', null)
          .limit(1);
        if (agent.instance_id) {
          humanQuery = humanQuery.eq('instance_id', agent.instance_id);
        }
        if (enrollment.current_step === 0) {
          humanQuery = humanQuery.gt('sent_at', enrollment.enrolled_at);
        }
        const { data: recentHumanOutbound } = await humanQuery.maybeSingle();

        if (recentHumanOutbound) {
          // Adiar para 6h após a msg humana
          const newNextAction = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
          console.log(`⏸️ Cadência ${enrollment.id} adiada — humano ativo (msg recente). Próxima: ${newNextAction}`);
          await supabase
            .from('ai_agent_cadence_enrollments')
            .update({ next_action_at: newNextAction, updated_at: new Date().toISOString() })
            .eq('id', enrollment.id);
          continue;
        }
      }

      // GUARD: Se lead tem reunião/call agendada nos próximos 3 dias, adiar cadência
      // IA não deve mandar msg de prospecção na véspera de reunião marcada pelo vendedor
      {
        const nowISO_meeting = new Date().toISOString();
        const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: upcomingMeeting } = await supabase
          .from('company_activities')
          .select('name, scheduled_at, task_type')
          .eq('lead_id', enrollment.lead_id)
          .in('task_type', ['meeting', 'call'])
          .eq('completed', false)
          .gt('scheduled_at', nowISO_meeting)
          .lt('scheduled_at', threeDaysFromNow)
          .order('scheduled_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (upcomingMeeting?.scheduled_at) {
          // Adiar para 24h DEPOIS da reunião
          const meetingTime = new Date(upcomingMeeting.scheduled_at).getTime();
          const newNextAction = new Date(meetingTime + 24 * 60 * 60 * 1000).toISOString();
          const meetDate = new Date(upcomingMeeting.scheduled_at).toLocaleDateString('pt-BR');
          console.log(`⏸️ Cadência ${enrollment.id} adiada — lead ${enrollment.lead_id} tem ${upcomingMeeting.task_type} agendada em ${meetDate} ("${upcomingMeeting.name}"). Próxima: ${newNextAction}`);
          await supabase
            .from('ai_agent_cadence_enrollments')
            .update({ next_action_at: newNextAction, updated_at: new Date().toISOString() })
            .eq('id', enrollment.id);
          continue;
        }
      }

      // Verificar only_if_no_reply: se lead respondeu desde enrollment, marcar replied
      if (currentStep.only_if_no_reply) {
        const { data: recentReply } = await supabase
          .from('whatsapp_messages')
          .select('id')
          .eq('lead_id', enrollment.lead_id)
          .eq('is_from_me', false)
          .is('group_id', null)
          .gt('sent_at', enrollment.enrolled_at)
          .limit(1)
          .single();

        if (recentReply) {
          console.log(`⏭️ Lead respondeu, marcando enrollment como replied`);
          await supabase
            .from('ai_agent_cadence_enrollments')
            .update({ status: 'replied', updated_at: new Date().toISOString() })
            .eq('id', enrollment.id);
          continue;
        }
      }

      // Buscar lead e enriquecer com nome do estágio
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', enrollment.lead_id)
        .single();

      if (lead) {
        // Resolver telefone real do WhatsApp (corrige 9º dígito e divergências)
        lead.phone = await resolveLeadPhone(supabase, lead.id, lead.phone);
        await enrichLeadWithStageName(supabase, lead);
      }

      if (!lead) {
        console.log(`⏭️ Lead ${enrollment.lead_id} nao encontrado`);
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        continue;
      }

      // GUARD: Lead já é cliente? Cancelar enrollment (apenas para prospecção, não para webinário)
      // Webinário é gratuito — clientes também participam
      const isClientGuardEnabled = !agent.pipeline_id || agent.pipeline_id !== '90b09d81-8282-4503-a869-1787baf8f736';
      if (isClientGuardEnabled && await isLeadAlreadyClient(supabase, enrollment.lead_id)) {
        console.log(`⏭️ Lead ${lead.name} já é cliente — cancelando cadência de prospecção`);
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        continue;
      }

      // PROTEÇÃO: verificar se estágio do lead AINDA bate com o enrollment
      // Suporta aliases: enrollment.stage pode ser sub-stage (ex: "No-show_confirmou")
      // que mapeia para o pipeline stage real (ex: "No-show") via cadence_stage_aliases
      const stageAliases: Record<string, string> = settings.cadence_stage_aliases || {};
      const expectedPipelineStage = stageAliases[enrollment.stage] || enrollment.stage;
      let stageMatch = lead.pipeline_stage_name === expectedPipelineStage;

      // MULTI-PIPELINE: se lead está em outro pipeline, checar se tem deal aberto no pipeline do agente
      // Se tem deal aberto → agente pode processar (target_stages já controla quando atua)
      if (!stageMatch && agent.pipeline_id) {
        const { data: agentDeal } = await supabase
          .from('deals')
          .select('id')
          .eq('lead_id', enrollment.lead_id)
          .eq('pipeline_id', agent.pipeline_id)
          .in('status', ['open', 'negotiation'])
          .limit(1)
          .maybeSingle();

        if (agentDeal) {
          stageMatch = true;
          console.log(`🔀 Multi-pipeline: lead "${lead.name}" tem deal aberto no pipeline do agente — match OK`);
        }
      }

      if (lead.pipeline_stage_name && !stageMatch) {
        console.log(`⏭️ Lead ${lead.name} está em "${lead.pipeline_stage_name}" sem deal no pipeline do agente — cancelando`);
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        continue;
      }

      // Buscar instância WhatsApp — REGRA: se agente tem instance_id, usa SOMENTE ela. Sem fallback.
      let instance: WhatsAppInstance | null = null;
      if (agent.instance_id) {
        const { data: agentInst } = await supabase
          .from('whatsapp_instances')
          .select('id, api_key, api_url, metadata, status')
          .eq('id', agent.instance_id)
          .single();
        if (!agentInst) {
          console.log(`🚫 Instância do agente ${agent.instance_id} não encontrada — NÃO usar fallback`);
          errors++;
          continue;
        }
        // Cloud API não precisa de status check (é oficial, não desconecta)
        if (agentInst.status === 'disconnected' && agentInst.metadata?.type !== 'cloud_api') {
          console.log(`🚫 Instância do agente ${agent.instance_id} desconectada — NÃO enviar por outra instância`);
          errors++;
          continue;
        }
        instance = agentInst;
        console.log(`📱 Cadência usando instância do agente: ${instance.id} (${agentInst.metadata?.type || 'uazapi'})`);
      } else {
        instance = await getLeadWhatsAppInstance(supabase, enrollment.lead_id);
      }
      if (!instance) {
        console.log(`⏭️ Sem instância WhatsApp para lead ${lead.name}`);
        errors++;
        continue;
      }

      // Determinar tipo de contato para rate limit granular
      // Cold = step 0, primeira mensagem para esse lead (nunca recebeu msg nossa)
      // Follow-up unreplied = lead não respondeu nenhuma das nossas mensagens
      // Reply = lead respondeu algo (tratado em outro fluxo, não chega aqui)
      let cadenceContactType: ContactType = 'followup_unreplied';
      if (enrollment.current_step === 0) {
        // Check if we ever sent a message to this lead before
        const { count } = await supabase
          .from('whatsapp_messages')
          .select('id', { count: 'exact', head: true })
          .eq('lead_id', enrollment.lead_id)
          .eq('is_from_me', true)
          .is('group_id', null);
        if (!count || count === 0) {
          cadenceContactType = 'cold';
        }
      }

      // Rate limit check POR enrollment (pode ter atingido o limite no meio do batch)
      const rateCheck = await checkRateLimit(supabase, instance.id, settings, cadenceContactType);
      if (!rateCheck.allowed) {
        console.log(`🚫 Rate limit: ${rateCheck.reason} — pulando enrollment ${enrollment.id}`);
        // Restaurar next_action_at para 5 minutos no futuro (o lock empurrou pra 1h)
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ next_action_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
          .eq('id', enrollment.id);
        // Logar rate limit
        await supabase.from('ai_agent_logs').insert({
          lead_id: enrollment.lead_id,
          agent_id: enrollment.agent_id,
          log_type: 'rate_limit',
          data: {
            contact_type: cadenceContactType,
            hour_count: rateCheck.hourCount,
            day_count: rateCheck.dayCount,
            max_hour: settings.cadence_max_messages_per_hour,
            max_day: settings.cadence_max_messages_per_day,
            max_cold: settings.max_new_contacts_per_day,
            max_followup: settings.max_followups_unreplied_per_day,
            reason: rateCheck.reason,
          },
        });
        rateLimitHit = true;
        break; // Parar o loop inteiro — não adianta tentar os outros
      }

      // Delay entre leads (não atrasa o primeiro envio)
      if (processed > 0 && settings.cadence_delay_between_leads_ms > 0) {
        console.log(`⏳ Delay entre leads: ${settings.cadence_delay_between_leads_ms}ms`);
        await new Promise(resolve => setTimeout(resolve, settings.cadence_delay_between_leads_ms));
      }

      // Garantir que ai_agent_conversations existe ANTES do lock
      // O lock faz UPDATE nessa tabela — sem row, o lock sempre falha (chicken-and-egg)
      const { data: preConv } = await supabase
        .from('ai_agent_conversations')
        .select('id, status, messages_history')
        .eq('lead_id', enrollment.lead_id)
        .eq('agent_id', enrollment.agent_id)
        .maybeSingle();

      if (!preConv) {
        await supabase
          .from('ai_agent_conversations')
          .insert({
            lead_id: enrollment.lead_id,
            agent_id: enrollment.agent_id,
            status: 'active',
            messages_history: [],
          });
        console.log(`📝 Conversa criada para lead ${lead.name} antes do lock`);
      } else if (enrollment.current_step === 0 && (preConv.status !== 'active' || preConv.messages_history?.length > 0)) {
        // Cadência step 0: conversa deve estar active e limpa
        // - Se completed/paused → reativar
        // - Se tem histórico → resetar (nova abordagem, ex: novo webinário)
        await supabase
          .from('ai_agent_conversations')
          .update({
            status: 'active',
            messages_history: [],
            last_processed_at: null,
            processing_lock: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', preConv.id);
        console.log(`🔄 Conversa reativada/resetada para lead ${lead.name} — step 0 (status era: ${preConv.status}, msgs: ${preConv.messages_history?.length || 0})`);
      }

      // LOCK: Adquirir lock exclusivo pro lead antes de enviar cadência
      const { data: cadenceLock } = await supabase.rpc('try_acquire_agent_lock', {
        p_lead_id: enrollment.lead_id,
        p_lock_duration: '90 seconds',
      });
      if (!cadenceLock) {
        console.log(`🔒 Cadência ${enrollment.id}: Lock não adquirido para lead ${lead.name} — outra instância processando`);
        // Restaurar next_action_at para 2 min no futuro (o lock empurrou pra 1h)
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ next_action_at: new Date(Date.now() + 2 * 60 * 1000).toISOString() })
          .eq('id', enrollment.id);
        continue;
      }

      let cadenceResult: { success: boolean; error?: string; sentMessage?: string };
      const beforeCadenceSend = new Date(Date.now() - 2000).toISOString();
      try {
        // Executar o step
        cadenceResult = await executeCadenceStep(supabase, enrollment, currentStep, agent, lead, instance);
      } finally {
        try { await supabase.rpc('release_agent_lock', { p_lead_id: enrollment.lead_id }); } catch {}
      }
      const result = cadenceResult;

      const now = new Date().toISOString();

      if (result.success) {
        // Incrementar contador de rate limit (com tipo de contato)
        try {
          await incrementSendCount(supabase, instance.id, cadenceContactType);
        } catch (incErr) {
          console.error(`⚠️ incrementSendCount falhou para cadência ${enrollment.id}:`, incErr);
        }

        // Marcar mensagens como enviadas pela IA (async)
        markRecentMessagesAsAI(supabase, enrollment.lead_id, enrollment.agent_id, agent.name, beforeCadenceSend)
          .catch(err => console.error('Erro ao marcar msgs cadência como AI:', err));

        // Suporte a repeat: se step tem repeat=true, não avança current_step
        const repeatCount = enrollment.metadata?.repeat_count || 0;
        const shouldRepeat = currentStep.repeat && (!currentStep.max_repeats || repeatCount < currentStep.max_repeats - 1);

        if (shouldRepeat) {
          // Repetir o mesmo step — incrementar repeat_count, agendar próxima execução
          const nextDelay = currentStep.delay_minutes || 1440; // default 24h
          const nextActionAt = new Date(Date.now() + nextDelay * 60 * 1000).toISOString();
          const updatedMetadata = { ...(enrollment.metadata || {}), repeat_count: repeatCount + 1 };

          await supabase
            .from('ai_agent_cadence_enrollments')
            .update({
              next_action_at: nextActionAt,
              last_step_at: now,
              updated_at: now,
              metadata: updatedMetadata,
            })
            .eq('id', enrollment.id);
          console.log(`🔄 Step ${currentStep.step_order} repeat ${repeatCount + 1}/${currentStep.max_repeats || '∞'}`);
        } else {
          const nextStepIndex = enrollment.current_step + 1;
          const isLastStep = nextStepIndex >= stageSteps.length;

          if (isLastStep) {
            // Último step - marcar como completo
            await supabase
              .from('ai_agent_cadence_enrollments')
              .update({
                current_step: nextStepIndex,
                status: 'completed',
                last_step_at: now,
                completed_at: now,
                updated_at: now,
                metadata: { ...(enrollment.metadata || {}), repeat_count: 0 },
              })
              .eq('id', enrollment.id);
          } else {
            // Calcular next_action_at do próximo step
            const nextStep = stageSteps[nextStepIndex];
            const nextDelay = nextStep.delay_minutes || 0;
            const nextActionAt = new Date(Date.now() + nextDelay * 60 * 1000).toISOString();

            await supabase
              .from('ai_agent_cadence_enrollments')
              .update({
                current_step: nextStepIndex,
                next_action_at: nextActionAt,
                last_step_at: now,
                updated_at: now,
                metadata: { ...(enrollment.metadata || {}), repeat_count: 0 },
              })
              .eq('id', enrollment.id);
          }
        }

        // Garantir que existe ai_agent_conversation para IA assumir se lead responder
        const { data: existingConv } = await supabase
          .from('ai_agent_conversations')
          .select('id, messages_history')
          .eq('lead_id', enrollment.lead_id)
          .eq('agent_id', enrollment.agent_id)
          .single();

        if (!existingConv) {
          const initialHistory = result.sentMessage ? [{
            role: 'assistant',
            content: result.sentMessage,
            timestamp: now,
            source: 'cadence',
          }] : [];
          await supabase
            .from('ai_agent_conversations')
            .insert({
              lead_id: enrollment.lead_id,
              agent_id: enrollment.agent_id,
              status: 'active',
              messages_history: initialHistory,
            });
        } else if (result.sentMessage) {
          // Salvar mensagem de cadência no messages_history para contexto
          const updatedHistory = [
            ...(existingConv.messages_history || []),
            {
              role: 'assistant',
              content: result.sentMessage,
              timestamp: now,
              source: 'cadence',
            },
          ];
          await supabase
            .from('ai_agent_conversations')
            .update({ messages_history: updatedHistory })
            .eq('id', existingConv.id);
        }

        // Logar no ai_agent_logs (incluindo conteúdo da msg para anti-repetição)
        await supabase.from('ai_agent_logs').insert({
          conversation_id: existingConv?.id || null,
          lead_id: enrollment.lead_id,
          agent_id: enrollment.agent_id,
          log_type: 'message_sent',
          data: {
            source: 'cadence',
            content: result.sentMessage || null,
            stage: enrollment.stage,
            step_order: currentStep.step_order,
            action_type: currentStep.action_type,
            enrollment_id: enrollment.id,
          },
        });

        // Executar post_action se configurada
        if (currentStep.post_action) {
          const pa = currentStep.post_action;
          console.log(`🎯 Executando post_action: ${pa.type}`);
          try {
            switch (pa.type) {
              case 'move_stage': {
                if (pa.target_stage) {
                  // Usar pipeline do AGENTE (não do lead) — multi-pipeline
                  const movePipelineId = agent.pipeline_id || (await supabase
                    .from('sales_pipeline_stages')
                    .select('pipeline_id')
                    .eq('id', lead.pipeline_stage_id)
                    .single()).data?.pipeline_id;

                  if (movePipelineId) {
                    const { data: targetStage } = await supabase
                      .from('sales_pipeline_stages')
                      .select('id')
                      .eq('pipeline_id', movePipelineId)
                      .eq('name', pa.target_stage)
                      .single();
                    if (targetStage) {
                      // Mover pipeline_stage_id do lead SÓ se o lead tá no mesmo pipeline do agente
                      const leadInAgentPipeline = await supabase
                        .from('sales_pipeline_stages')
                        .select('pipeline_id')
                        .eq('id', lead.pipeline_stage_id)
                        .single();
                      if (leadInAgentPipeline.data?.pipeline_id === movePipelineId) {
                        await supabase
                          .from('leads')
                          .update({ pipeline_stage_id: targetStage.id })
                          .eq('id', enrollment.lead_id);
                      }
                      // Mover deals abertos do pipeline do agente
                      await supabase
                        .from('deals')
                        .update({ pipeline_stage_id: targetStage.id })
                        .eq('lead_id', enrollment.lead_id)
                        .eq('pipeline_id', movePipelineId)
                        .eq('status', 'open');
                      console.log(`✅ Deal movido para ${pa.target_stage} no pipeline do agente`);
                    }
                  }
                }
                break;
              }
              case 'create_task': {
                await supabase
                  .from('company_activities')
                  .insert({
                    name: pa.task_title || `Follow-up manual: ${lead.name}`,
                    description: `Cadência "${enrollment.stage}" encerrou sem resposta. Lead precisa de atenção manual.`,
                    task_type: 'whatsapp',
                    priority: 'high',
                    lead_id: enrollment.lead_id,
                    team: 'comercial',
                  });
                console.log(`✅ Tarefa criada para ${lead.name}`);
                break;
              }
              case 'notify_human': {
                await supabase
                  .from('company_activities')
                  .insert({
                    name: `Atender ${lead.name} - Cadência sem resposta`,
                    description: `A cadência "${enrollment.stage}" terminou e o lead não respondeu. Requer atenção humana.`,
                    task_type: 'whatsapp',
                    priority: 'urgent',
                    lead_id: enrollment.lead_id,
                    team: 'comercial',
                  });
                console.log(`✅ Humano notificado sobre ${lead.name}`);
                break;
              }
            }
          } catch (paErr: any) {
            console.error(`❌ Erro no post_action: ${paErr.message}`);
          }
        }

        processed++;
      } else {
        const errorMsg = (typeof result.error === 'string' ? result.error : result.message) || 'Erro desconhecido no envio';
        console.error(`❌ Falha no cadence step: ${errorMsg}`);

        // Alertar no grupo se WhatsApp desconectou
        if (typeof errorMsg === 'string' && errorMsg.toLowerCase().includes('disconnected') && instance) {
          await notifyWhatsAppDisconnected(supabase, instance, errorMsg);
        }

        // Logar erro com mensagem real
        await supabase.from('ai_agent_logs').insert({
          lead_id: enrollment.lead_id,
          agent_id: enrollment.agent_id,
          log_type: 'error',
          data: {
            source: 'cadence',
            error: errorMsg,
            step_order: currentStep.step_order,
            enrollment_id: enrollment.id,
            error_type: isTemporaryError(errorMsg) ? 'temporary' : 'permanent',
          },
        });

        if (isTemporaryError(errorMsg)) {
          // ERRO TEMPORÁRIO: reagendar para 10 minutos, não pausar/cancelar
          const retryAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          await supabase
            .from('ai_agent_cadence_enrollments')
            .update({ next_action_at: retryAt, updated_at: new Date().toISOString() })
            .eq('id', enrollment.id);
          console.log(`⏳ Erro temporário, reagendado para 10min: ${errorMsg}`);
          errors++;
        } else {
          // ERRO PERMANENTE: pausar agente + cancelar enrollment + msg no chat

          // Inserir mensagem de erro VISÍVEL no chat do WhatsApp
          await supabase.from('whatsapp_messages').insert({
            instance_id: instance.id,
            remote_jid: `${lead.phone}@s.whatsapp.net`,
            message_id: `ai_error_${Date.now()}`,
            message_type: 'ai_system_error',
            content: `❌ Falha no envio: ${errorMsg}\n\nO agente foi pausado automaticamente. Verifique o número do contato e reative o agente quando resolvido.`,
            is_from_me: true,
            sent_at: new Date().toISOString(),
            lead_id: enrollment.lead_id,
            sender_name: agent.name || 'Agente IA',
            metadata: { sent_by: 'ai_agent', agent_name: agent.name, error: errorMsg, type: 'send_error' },
          }).then(({ error: msgErr }: any) => {
            if (msgErr) console.error('Erro ao criar msg de erro no chat:', msgErr);
          });

          // Inserir nota visível no inbox para o vendedor ver o erro
          await supabase.from('cs_conversation_notes').insert({
            lead_id: enrollment.lead_id,
            content: `⚠️ Agente IA falhou ao enviar mensagem: ${errorMsg}`,
            note_type: 'warning',
            created_by: null, // sistema
          }).then(({ error: noteErr }: any) => {
            if (noteErr) console.error('Erro ao criar nota de erro:', noteErr);
          });

          // Pausar o agente para esse lead (evitar loops de erro)
          await supabase.from('ai_agent_conversations')
            .update({
              status: 'paused_by_human',
              pause_reason: `Erro no envio: ${errorMsg}`,
              paused_at: new Date().toISOString(),
            })
            .eq('lead_id', enrollment.lead_id)
            .eq('status', 'active');

          // Cancelar enrollment para não ficar tentando
          await supabase.from('ai_agent_cadence_enrollments')
            .update({ status: 'cancelled' })
            .eq('id', enrollment.id);

          errors++;
        }
      }
    } catch (err: any) {
      console.error(`❌ Erro ao processar enrollment ${enrollment.id}:`, err);
      errors++;
    }
  }
  if (rateLimitHit) {
    console.log(`🚫 Rate limit atingido — ${processed} enviados antes de parar`);
  }

  } // fim do else (enrollments ativos)

  // ====== REATIVAÇÃO DE CADÊNCIAS REPLIED: REMOVIDO ======
  // Bloco removido — causava reenvio de template para leads que já tinham sido atendidos pela conversa normal.
  // 48 leads afetados entre 5-6/Abr/2026.
  // Se precisar reativar no futuro, deve ser configurável por agente (settings) e NUNCA resetar enrolled_at.

  // ====== AUTO-ENROLL REENGAJAMENTO: REMOVIDO ======
  // Bloco removido — UUIDs hardcoded de agente e etapa, auto-enrollava leads sem configuração.
  // Se precisar no futuro, deve ser configurável nas settings do agente.

  // ====== AUTO FOLLOW-UP 4H: REMOVIDO ======
  // Bloco removido — muito agressivo, mandava follow-up pra qualquer conversa com 4h de silêncio.
  // Se precisar no futuro, deve ser configurável nas settings do agente (enable, threshold, max).

  return { processed, errors };
}

// ==================== MAIN HANDLER ====================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Só service_role (crons/triggers) ou usuário logado (frontend). Bloqueia anon.
  if (!isAuthorizedCaller(req)) {
    return unauthorizedResponse(corsHeaders);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Hidratar API keys da tabela `config` (admin preenche em /configuracoes > API Keys).
  // Cache em memoria (60s TTL) no getIntegrationKey evita I/O a cada request.
  OPENAI_API_KEY = (await getIntegrationKey(supabase, "OPENAI_API_KEY")) || "";
  ANTHROPIC_API_KEY = (await getIntegrationKey(supabase, "ANTHROPIC_API_KEY")) || "";

  try {
    const body = await req.json();

    // Modo: Processar cadências proativas (chamado por cron a cada minuto)
    if (body.action === 'process_cadence') {
      const result = await processCadence(supabase);

      // Processar lembretes de calls/reuniões — DESATIVADO
      // Motivo: não checa atividade humana recente, manda msg por cima do vendedor.
      // Reativar quando for configurável por agente com guard de humano ativo.
      // const remindersResult = await processCallReminders(supabase);
      const remindersResult = { processed: 0, errors: 0 };

      return new Response(
        JSON.stringify({
          success: true,
          processed: result.processed + remindersResult.processed,
          errors: result.errors + remindersResult.errors,
          reminders: remindersResult,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Modo: Processar fila (chamado por cron ou trigger)
    if (body.action === 'process_queue') {
      // Primeira tentativa: busca mensagens prontas (scheduled_for <= now)
      let result = await processQueue(supabase);

      // Se nada encontrado, pode ser que o debounce ainda não passou
      // (trigger dispara HTTP logo após o INSERT com scheduled_for = now+30s)
      // Espera 32s e tenta de novo — assim processa dentro do mesmo request
      if (result.processed === 0 && result.errors === 0) {
        await new Promise(resolve => setTimeout(resolve, 32000));
        result = await processQueue(supabase);
      }

      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Modo: Enfileirar nova mensagem (chamado pelo webhook)
    if (body.action === 'enqueue_message') {
      const { lead_id, message_id, message_content } = body;

      if (!lead_id || !message_content) {
        return new Response(
          JSON.stringify({ error: 'lead_id e message_content são obrigatórios' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Buscar debounce do agente
      const { data: agent } = await supabase
        .from('ai_sales_agents')
        .select('settings')
        .eq('is_active', true)
        .limit(1)
        .single();

      const settings = mergeSettings(agent?.settings);
      const debounce_seconds = settings.debounce_seconds;

      // Cancelar mensagens pendentes anteriores deste lead (debounce)
      await supabase
        .from('ai_agent_message_queue')
        .update({ status: 'cancelled' })
        .eq('lead_id', lead_id)
        .eq('status', 'pending');

      // Agendar nova mensagem
      const scheduledFor = new Date(Date.now() + debounce_seconds * 1000);

      const { data: queueItem, error } = await supabase
        .from('ai_agent_message_queue')
        .insert({
          lead_id,
          message_id,
          message_content,
          scheduled_for: scheduledFor.toISOString(),
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ success: true, queue_id: queueItem.id, scheduled_for: scheduledFor }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Modo: Pausar/Retomar conversa
    if (body.action === 'toggle_conversation') {
      const { lead_id, pause, paused_by, reason } = body;

      const updates: any = {
        status: pause ? 'paused_by_human' : 'active',
      };

      if (pause) {
        updates.paused_by = paused_by;
        updates.paused_at = new Date().toISOString();
        updates.pause_reason = reason;
      } else {
        updates.paused_by = null;
        updates.paused_at = null;
        updates.pause_reason = null;
      }

      // Ao retomar, só permitir retomar conversas pausadas (não completed/transferred)
      let query = supabase
        .from('ai_agent_conversations')
        .update(updates)
        .eq('lead_id', lead_id);

      if (!pause) {
        // Guard: só reativar conversas que foram pausadas, não completed/transferred
        query = query.in('status', ['paused_by_human', 'paused_by_schedule']);
      }

      const { data, error } = await query.select().single();

      if (error) {
        throw error;
      }

      // Ao retomar, reativar APENAS cadence enrollments pausados (não cancelled!)
      if (!pause && data) {
        await supabase
          .from('ai_agent_cadence_enrollments')
          .update({ status: 'active', next_action_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('lead_id', lead_id)
          .eq('agent_id', data.agent_id)
          .eq('status', 'paused');  // Só reativar pausados, NÃO cancelled
      }

      return new Response(
        JSON.stringify({ success: true, conversation: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Modo: Processar mensagem diretamente (sem fila - para testes)
    if (body.action === 'process_direct') {
      const { lead_id } = body;
      let { message_content } = body;

      // Se não veio message_content, buscar última mensagem não processada do lead
      if (!message_content) {
        const { data: lastMsg } = await supabase
          .from('whatsapp_messages')
          .select('content')
          .eq('lead_id', lead_id)
          .eq('is_from_me', false)
          .is('group_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        message_content = lastMsg?.content || '';
      }

      if (!message_content) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sem mensagem para processar' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await processLeadMessage(supabase, {
        lead_id,
        message_content,
        conversation_id: null,
      });

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Modo: Processar com debounce interno (chamado pelo trigger)
    if (body.action === 'process_with_debounce') {
      const { lead_id, message_id } = body;

      // Buscar configuração do agente
      const { data: agent } = await supabase
        .from('ai_sales_agents')
        .select('settings')
        .eq('is_active', true)
        .limit(1)
        .single();

      const settings = mergeSettings(agent?.settings);
      const debounceSeconds = settings.debounce_seconds;
      const lockDuration = `${settings.lock_duration_seconds} seconds`;

      console.log(`⏳ Aguardando debounce de ${debounceSeconds}s para lead ${lead_id}`);

      // Esperar o debounce
      await new Promise(resolve => setTimeout(resolve, debounceSeconds * 1000));

      // TENTAR ADQUIRIR LOCK (atômico no banco)
      const { data: lockAcquired } = await supabase.rpc('try_acquire_agent_lock', {
        p_lead_id: lead_id,
        p_lock_duration: lockDuration
      });

      if (!lockAcquired) {
        console.log(`🔒 Lock não adquirido, outra instância está processando`);
        // So loga se a conversa nao esta ativa (caso comum: pausada por humano)
        const { data: conv } = await supabase
          .from('ai_agent_conversations')
          .select('id, agent_id, status')
          .eq('lead_id', lead_id)
          .maybeSingle();
        if (conv && conv.status !== 'active') {
          await supabase.rpc('log_ai_agent_event', {
            p_lead_id: lead_id,
            p_event_type: 'skipped',
            p_reason: `conversation_${conv.status}`,
            p_message: `Agente nao processou — conversa esta com status "${conv.status}". Reative o agente para retomar.`,
            p_agent_id: conv.agent_id,
            p_conversation_id: conv.id,
          });
        }
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'lock_not_acquired' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`🔓 Lock adquirido para lead ${lead_id}`);

      try {
        // === DEBOUNCE SECUNDÁRIO PÓS-LOCK ===
        // Após adquirir o lock, verifica se a mensagem mais recente do lead
        // ainda é muito nova (< debounce_seconds). Se sim, espera o restante.
        // Isso garante que mensagens rápidas em sequência sejam todas coletadas.
        const { data: latestPending } = await supabase
          .from('whatsapp_messages')
          .select('sent_at')
          .eq('lead_id', lead_id)
          .eq('is_from_me', false)
          .is('group_id', null)
          .order('sent_at', { ascending: false })
          .limit(1)
          .single();

        if (latestPending) {
          const msgAge = Date.now() - new Date(latestPending.sent_at).getTime();
          const debounceMs = debounceSeconds * 1000;
          if (msgAge < debounceMs) {
            const remainingWait = debounceMs - msgAge;
            console.log(`⏳ Debounce secundário: aguardando mais ${remainingWait}ms`);
            await new Promise(resolve => setTimeout(resolve, remainingWait));
          }
        }

        // Buscar última resposta do agente para este lead (APENAS individuais, sem grupo)
        const { data: lastAgentMsg } = await supabase
          .from('whatsapp_messages')
          .select('sent_at')
          .eq('lead_id', lead_id)
          .eq('is_from_me', true)
          .is('group_id', null)
          .order('sent_at', { ascending: false })
          .limit(1)
          .single();

        // Buscar TODAS as mensagens INDIVIDUAIS do lead desde a última resposta do agente (sem grupo)
        let messagesQuery = supabase
          .from('whatsapp_messages')
          .select('content, sent_at')
          .eq('lead_id', lead_id)
          .eq('is_from_me', false)
          .is('group_id', null)
          .order('sent_at', { ascending: true });

        if (lastAgentMsg?.sent_at) {
          messagesQuery = messagesQuery.gt('sent_at', lastAgentMsg.sent_at);
        }

        const { data: pendingMessages } = await messagesQuery;

        // Combinar todas as mensagens em uma só
        let combinedMessage = '';
        if (pendingMessages && pendingMessages.length > 0) {
          if (pendingMessages.length === 1) {
            combinedMessage = pendingMessages[0].content || '';
          } else {
            // Múltiplas mensagens - combinar com contexto
            combinedMessage = pendingMessages
              .map(m => m.content)
              .filter(c => c)
              .join('\n');
            console.log(`📝 Combinando ${pendingMessages.length} mensagens do lead`);
          }
        }

        if (!combinedMessage.trim()) {
          // Liberar lock antes de sair
          await supabase.rpc('release_agent_lock', { p_lead_id: lead_id });
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: 'no_message_content' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Processar mensagem combinada (lock já adquirido por este caller)
        const result = await processLeadMessage(supabase, {
          lead_id,
          message_content: combinedMessage,
          conversation_id: null,
        }, { lockAlreadyHeld: true });

        // CRÍTICO: Marcar TODOS os queue items pendentes/processing deste lead como completed
        // Sem isso, o cron process_queue vai reprocessar a mesma mensagem!
        try {
          await supabase
            .from('ai_agent_message_queue')
            .update({
              status: 'completed',
              processed_at: new Date().toISOString(),
              result: { processed_by: 'process_with_debounce', response: result.response || null },
            })
            .eq('lead_id', lead_id)
            .in('status', ['pending', 'processing']);
        } catch (queueErr) {
          console.error(`⚠️ Erro ao marcar queue items como completed para lead ${lead_id}:`, queueErr);
        }

        // Liberar lock após processar
        await supabase.rpc('release_agent_lock', { p_lead_id: lead_id });

        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } catch (error: any) {
        // Liberar lock em caso de erro
        await supabase.rpc('release_agent_lock', { p_lead_id: lead_id });
        throw error;
      }
    }

    return new Response(
      JSON.stringify({ error: 'Action não reconhecida' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (error: any) {
    console.error("❌ Erro geral:", error);
    return new Response(
      JSON.stringify({ error: error.message || String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
