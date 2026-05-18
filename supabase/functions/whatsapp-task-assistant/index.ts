import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface TaskBotConfig {
  id: string;
  name: string;
  instance_id: string | null;
  bot_mention_id: string;
  enabled_group_ids: string[];
  ai_prompt: string;
  context_messages_count: number;
  auto_assign_to_sender: boolean;
  default_task_type: string;
  notify_on_creation: boolean;
  is_active: boolean;
}

interface WhatsAppInstance {
  id: string;
  api_key: string;
  api_url: string;
}

// ==================== PROMPT TÉCNICO (FIXO - NÃO EDITÁVEL) ====================
const TECHNICAL_PROMPT = `## SUAS CAPACIDADES (ACTIONS)

### 1. create_task - Criar Tarefa
Cria tarefa em company_activities.
{
  "action": "create_task",
  "task": {
    "name": "string (obrigatório)",
    "description": "string",
    "task_type": "call|meeting|follow_up|whatsapp|onboarding|internal",
    "priority": "low|medium|high|urgent",
    "due_date": "YYYY-MM-DD",
    "due_time": "HH:MM",
    "responsavel_name": "nome do responsável"
  },
  "message": "Sua resposta conversacional"
}

### 2. create_lead - Criar Lead
Cria novo lead na base.
{
  "action": "create_lead",
  "lead": {
    "name": "string (obrigatório)",
    "phone": "string (obrigatório, formato: 5535997461323)",
    "email": "string",
    "instagram": "string (@usuario)",
    "region": "string (cidade/estado)",
    "sales_stage": "captura|qualificacao|agendamento|negociacao",
    "utm_source": "origem do lead",
    "context": "observações e contexto sobre o lead"
  },
  "message": "Sua resposta conversacional"
}

### 3. create_deal - Criar Oportunidade
Cria deal/oportunidade para um lead.
{
  "action": "create_deal",
  "deal": {
    "lead_name_or_phone": "nome ou telefone do lead para buscar",
    "lead_id": "UUID se já souber",
    "product_name": "nome do produto",
    "negotiated_price": 5000,
    "original_price": 6000,
    "discount_percent": 16.67,
    "payment_method": "pix|boleto|credit_card",
    "installments": 1,
    "notes": "observações",
    "expected_close_date": "YYYY-MM-DD"
  },
  "message": "Sua resposta conversacional"
}

### 4. create_lead_and_deal - Criar Lead + Oportunidade
Cria lead novo E já cria oportunidade.
{
  "action": "create_lead_and_deal",
  "lead": { ...dados do lead },
  "deal": { ...dados do deal (sem lead_id, sem negotiated_price se não souber) },
  "message": "Sua resposta conversacional"
}

### 5. update_lead - Atualizar Lead
Atualiza dados de um lead.
{
  "action": "update_lead",
  "lead_identifier": "nome, telefone ou UUID",
  "updates": {
    "sales_score": 85,
    "sales_stage": "negociacao",
    "bant_budget": true,
    "bant_authority": true,
    "bant_need": true,
    "bant_timeline": true,
    "context": "novas observações"
  },
  "message": "Sua resposta conversacional"
}

### 6. update_deal - Atualizar Oportunidade
Atualiza deal existente.
{
  "action": "update_deal",
  "deal_identifier": "nome do cliente ou UUID do deal",
  "updates": {
    "negotiated_price": 4500,
    "status": "won|lost|negotiation",
    "lost_reason": "motivo se perdido",
    "notes": "novas notas"
  },
  "message": "Sua resposta conversacional"
}

### 7. query_data - Consultar Dados
Busca informações do banco.
{
  "action": "query_data",
  "query_type": "pipeline_summary|leads_hot|deals_open|tasks_pending|lead_info|deal_info|team_tasks",
  "filters": {
    "name": "filtro por nome",
    "phone": "filtro por telefone",
    "date_from": "YYYY-MM-DD",
    "date_to": "YYYY-MM-DD",
    "responsavel": "nome do responsável",
    "limit": 10
  },
  "message": "Sua resposta conversacional"
}

### 8. ask_question - Pedir Mais Informações
Quando precisar de mais dados.
{
  "action": "ask_question",
  "question": "Sua pergunta natural"
}

## TABELAS PRINCIPAIS (CAMPOS REAIS)

### leads
- id (uuid), name (text, NOT NULL), phone (text, NOT NULL)
- email, instagram, region
- sales_score (0-100), sales_stage (captura/qualificacao/agendamento/negociacao/fechado/perdido)
- bant_budget, bant_authority, bant_need, bant_timeline (boolean)
- utm_source, utm_campaign, utm_medium
- context (text - observações)
- status, created_at, updated_at

### deals
- id, lead_id, product_id, sales_rep_id
- title, original_price, negotiated_price, discount_percent
- payment_method, installments, status (negotiation/won/lost)
- pipeline_stage_id, expected_close_date, won_at, lost_at, lost_reason
- notes, ai_win_probability

### company_activities (tarefas)
- id, name, description, task_type (call/meeting/follow_up/whatsapp/onboarding/internal)
- priority (low/medium/high/urgent), status (not_started/in_progress/completed)
- due_datetime, completed, responsavel_id, lead_id, organization_id
- meeting_link, team (cs/comercial)

### products
- id, name, price, description, is_active

### team_members
- id, name, phone, email, role

## REGRAS TÉCNICAS

1. SEMPRE retorne JSON válido com "action" e "message"
2. Se não entender, use ask_question
3. Para criar deal de lead existente, SEMPRE busque o lead primeiro
4. Use nomes parciais para buscar (ex: "João" encontra "João Silva")
5. Datas relativas: "hoje", "amanhã", "segunda" - converta para YYYY-MM-DD
6. Valores monetários: interprete "5k" = 5000, "2.5k" = 2500
7. TELEFONE: Sempre formate como números apenas, ex: "5535997461323" (sem +, espaços ou traços)
8. Se não souber o valor do deal, crie sem negotiated_price ou pergunte`;

// ==================== PROMPT PADRÃO DE PERSONALIDADE ====================
const DEFAULT_PERSONALITY_PROMPT = `Você é a CAROL, gestora IA do time comercial.

## SUA PERSONALIDADE
- Você é uma gestora HUMANA, fala de forma natural e amigável
- Use linguagem conversacional, como se estivesse falando com um colega de trabalho
- Pode usar gírias leves e expressões do dia a dia
- Seja direta mas simpática
- Use emojis com moderação, de forma natural

## TOM DAS MENSAGENS
- Seja proativa e inteligente - se puder resolver, resolva!
- Mensagens devem ser conversacionais e humanas, não robóticas
- Comemore as conquistas do time
- Dê dicas contextuais quando fizer sentido

## EXEMPLOS DE TOM

Ao criar lead: "Pronto! Cadastrei o João aqui. Quer que eu já crie uma oportunidade pra ele?"
Ao criar deal: "Fechado! Criei a oportunidade de 5k pra Maria. Bora fechar essa!"
Ao marcar como ganho: "ISSO AÍ! Marquei como ganho! Parabéns pelo fechamento! 🎉"
Ao consultar: "Deixa eu ver aqui..." ou "Beleza, achei!"
Ao não entender: "Não entendi direito, pode explicar melhor?"`;

/**
 * Combina o prompt técnico com o prompt de personalidade
 */
function buildSystemPrompt(customPersonalityPrompt?: string): string {
  const personality = customPersonalityPrompt?.trim() || DEFAULT_PERSONALITY_PROMPT;
  return `${personality}\n\n---\n\n${TECHNICAL_PROMPT}`;
}

/**
 * Envia mensagem para o grupo via UAZAPI
 */
async function sendGroupMessage(
  instance: WhatsAppInstance,
  groupJid: string,
  message: string
): Promise<boolean> {
  try {
    const apiUrl = `${instance.api_url}/send/text`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "token": instance.api_key,
      },
      body: JSON.stringify({
        number: groupJid,
        text: message,
      }),
    });

    const result = await response.json();
    console.log("📤 Resposta UAZAPI:", result);
    return response.ok;
  } catch (error) {
    console.error("❌ Erro ao enviar mensagem:", error);
    return false;
  }
}

/**
 * Chama a API do Claude para processar a mensagem
 */
async function callClaude(
  supabase: any,
  systemPrompt: string,
  contextMessages: any[],
  triggerMessage: string,
  senderName: string
): Promise<any> {
  const contextText = contextMessages
    .map((m) => `[${m.sender_name}]: ${m.content}`)
    .join("\n");

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const dayOfWeek = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][today.getDay()];

  const userMessage = `DATA DE HOJE: ${dateStr} (${dayOfWeek})

CONTEXTO DAS ÚLTIMAS MENSAGENS DO GRUPO:
${contextText}

---

MENSAGEM QUE MENCIONOU O BOT:
[${senderName}]: ${triggerMessage}

Analise o contexto e a solicitação. Retorne APENAS um JSON válido com a ação a ser tomada.
IMPORTANTE: Use a data de hoje (${dateStr}) como referência para "hoje", "amanhã", "segunda", etc.`;

  const ANTHROPIC_API_KEY = await requireIntegrationKey(supabase, "ANTHROPIC_API_KEY");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || "";

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error("Resposta da IA não contém JSON válido");
}

/**
 * Formata telefone para padrão brasileiro (apenas números)
 */
function formatPhone(phone: string): string {
  // Remove tudo que não é número
  let cleaned = phone.replace(/\D/g, "");

  // Adiciona 55 se não tiver
  if (!cleaned.startsWith("55") && cleaned.length <= 11) {
    cleaned = "55" + cleaned;
  }

  return cleaned;
}

/**
 * Busca responsável pelo nome ou telefone
 */
async function findResponsavel(
  supabase: any,
  name?: string,
  phone?: string
): Promise<any | null> {
  if (name) {
    const { data } = await supabase
      .from("team_members")
      .select("id, name, phone, email, role")
      .ilike("name", `%${name}%`)
      .limit(1)
      .single();
    return data;
  }

  if (phone) {
    const cleanPhone = phone.replace(/\D/g, "");
    const { data } = await supabase
      .from("team_members")
      .select("id, name, phone, email, role")
      .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${cleanPhone.slice(-8)}%`)
      .limit(1)
      .single();
    return data;
  }

  return null;
}

/**
 * Busca lead pelo nome ou telefone
 */
async function findLead(
  supabase: any,
  identifier: string
): Promise<any | null> {
  // Tenta buscar por UUID primeiro
  if (identifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("id", identifier)
      .single();
    return data;
  }

  // Busca por telefone (se parecer número)
  const cleanPhone = identifier.replace(/\D/g, "");
  if (cleanPhone.length >= 8) {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${cleanPhone.slice(-8)}%`)
      .limit(1)
      .single();
    if (data) return data;
  }

  // Busca por nome
  const { data } = await supabase
    .from("leads")
    .select("*")
    .ilike("name", `%${identifier}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

/**
 * Busca deal pelo nome do cliente ou UUID
 */
async function findDeal(
  supabase: any,
  identifier: string
): Promise<any | null> {
  // UUID
  if (identifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    const { data } = await supabase
      .from("deals")
      .select("*, lead:leads(id, name, phone)")
      .eq("id", identifier)
      .single();
    return data;
  }

  // Busca por nome do lead
  const { data: leads } = await supabase
    .from("leads")
    .select("id")
    .ilike("name", `%${identifier}%`)
    .limit(5);

  if (leads && leads.length > 0) {
    const leadIds = leads.map((l: any) => l.id);
    const { data: deal } = await supabase
      .from("deals")
      .select("*, lead:leads(id, name, phone)")
      .in("lead_id", leadIds)
      .neq("status", "lost")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    return deal;
  }

  return null;
}

/**
 * Busca produto pelo nome
 */
async function findProduct(
  supabase: any,
  name: string
): Promise<any | null> {
  const { data } = await supabase
    .from("products")
    .select("id, name, price")
    .ilike("name", `%${name}%`)
    .eq("is_active", true)
    .limit(1)
    .single();
  return data;
}

/**
 * Busca primeiro estágio do pipeline
 */
async function getFirstPipelineStage(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("sales_pipeline_stages")
    .select("id")
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position", { ascending: true })
    .limit(1)
    .single();
  return data?.id || null;
}

/**
 * Busca estágio "ganho" do pipeline
 */
async function getWonPipelineStage(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("sales_pipeline_stages")
    .select("id")
    .eq("is_won", true)
    .limit(1)
    .single();
  return data?.id || null;
}

/**
 * Busca estágio "perdido" do pipeline
 */
async function getLostPipelineStage(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("sales_pipeline_stages")
    .select("id")
    .eq("is_lost", true)
    .limit(1)
    .single();
  return data?.id || null;
}

// ==================== ACTION HANDLERS ====================

async function handleCreateTask(
  supabase: any,
  taskData: any,
  responsavelId?: string,
  groupId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const dueDateTime = taskData.due_date && taskData.due_time
      ? `${taskData.due_date}T${taskData.due_time}:00`
      : taskData.due_date
      ? `${taskData.due_date}T09:00:00`
      : null;

    const insertData: any = {
        name: taskData.name,
        description: taskData.description || taskData.notes || null,
        task_type: taskData.task_type || "follow_up",
        priority: taskData.priority || "medium",
        due_datetime: dueDateTime,
        responsavel_id: responsavelId || null,
        status: "not_started",
        completed: false,
        team: "sales",
        metadata: {
          created_by_bot: true,
          source_group_id: groupId,
        },
      };
    if (taskData.lead_id) insertData.lead_id = taskData.lead_id;

    const { data, error } = await supabase
      .from("company_activities")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function handleCreateLead(
  supabase: any,
  leadData: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // Formatar telefone
    const phone = leadData.phone ? formatPhone(leadData.phone) : null;

    // Verificar se já existe por telefone
    if (phone) {
      const existing = await findLead(supabase, phone);
      if (existing) {
        return { success: true, data: existing };
      }
    }

    // Campos que realmente existem na tabela leads
    const insertData: any = {
      name: leadData.name,
      phone: phone || "0000000000", // phone é NOT NULL
      sales_stage: leadData.sales_stage || "qualificacao",
      sales_score: 50,
    };

    // Campos opcionais
    if (leadData.email) insertData.email = leadData.email;
    if (leadData.instagram) insertData.instagram = leadData.instagram;
    if (leadData.region) insertData.region = leadData.region;
    if (leadData.utm_source) insertData.utm_source = leadData.utm_source;
    if (leadData.context) insertData.context = leadData.context;

    const { data, error } = await supabase
      .from("leads")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function handleCreateDeal(
  supabase: any,
  dealData: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    let leadId = dealData.lead_id;

    // Buscar lead se não tiver ID
    if (!leadId && dealData.lead_name_or_phone) {
      const lead = await findLead(supabase, dealData.lead_name_or_phone);
      if (!lead) {
        return { success: false, error: `Lead não encontrado: ${dealData.lead_name_or_phone}` };
      }
      leadId = lead.id;
    }

    if (!leadId) {
      return { success: false, error: "lead_id ou lead_name_or_phone é obrigatório" };
    }

    // Buscar produto se informado
    let productId = dealData.product_id;
    let originalPrice = dealData.original_price;
    if (!productId && dealData.product_name) {
      const product = await findProduct(supabase, dealData.product_name);
      if (product) {
        productId = product.id;
        if (!originalPrice) originalPrice = product.price;
      }
    }

    // Buscar primeiro estágio
    const pipelineStageId = await getFirstPipelineStage(supabase);

    // Se não tem preço negociado, usa o original ou 0
    const negotiatedPrice = dealData.negotiated_price || originalPrice || 0;

    const { data, error } = await supabase
      .from("deals")
      .insert({
        lead_id: leadId,
        product_id: productId || null,
        pipeline_stage_id: pipelineStageId,
        original_price: originalPrice || negotiatedPrice,
        negotiated_price: negotiatedPrice,
        discount_percent: dealData.discount_percent || 0,
        payment_method: dealData.payment_method || null,
        installments: dealData.installments || 1,
        expected_close_date: dealData.expected_close_date || null,
        notes: dealData.notes || null,
        status: "negotiation",
        ai_win_probability: 50,
        metadata: { created_by_bot: true },
      })
      .select("*, lead:leads(name, phone)")
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function handleUpdateLead(
  supabase: any,
  identifier: string,
  updates: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const lead = await findLead(supabase, identifier);
    if (!lead) {
      return { success: false, error: `Lead não encontrado: ${identifier}` };
    }

    // Filtrar apenas campos válidos
    const validFields = [
      'name', 'email', 'phone', 'instagram', 'region',
      'sales_score', 'sales_stage', 'bant_budget', 'bant_authority',
      'bant_need', 'bant_timeline', 'utm_source', 'context', 'status'
    ];

    const filteredUpdates: any = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(updates)) {
      if (validFields.includes(key)) {
        filteredUpdates[key] = value;
      }
    }

    const { data, error } = await supabase
      .from("leads")
      .update(filteredUpdates)
      .eq("id", lead.id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function handleUpdateDeal(
  supabase: any,
  identifier: string,
  updates: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const deal = await findDeal(supabase, identifier);
    if (!deal) {
      return { success: false, error: `Deal não encontrado: ${identifier}` };
    }

    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Tratar status especiais
    if (updates.status === "won") {
      updateData.won_at = new Date().toISOString();
      updateData.pipeline_stage_id = await getWonPipelineStage(supabase);
    } else if (updates.status === "lost") {
      updateData.lost_at = new Date().toISOString();
      updateData.pipeline_stage_id = await getLostPipelineStage(supabase);
    }

    const { data, error } = await supabase
      .from("deals")
      .update(updateData)
      .eq("id", deal.id)
      .select("*, lead:leads(name, phone)")
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function handleQueryData(
  supabase: any,
  queryType: string,
  filters: any
): Promise<{ success: boolean; data?: any; message?: string; error?: string }> {
  try {
    switch (queryType) {
      case "pipeline_summary": {
        const { data: deals } = await supabase
          .from("deals")
          .select("status, negotiated_price, pipeline_stage:sales_pipeline_stages(name)")
          .neq("status", "lost");

        const summary = {
          total_deals: deals?.length || 0,
          total_value: deals?.reduce((sum: number, d: any) => sum + (Number(d.negotiated_price) || 0), 0) || 0,
          won: deals?.filter((d: any) => d.status === "won").length || 0,
          negotiation: deals?.filter((d: any) => d.status === "negotiation").length || 0,
          by_stage: {} as Record<string, number>,
        };

        deals?.forEach((d: any) => {
          const stage = d.pipeline_stage?.name || "Sem etapa";
          summary.by_stage[stage] = (summary.by_stage[stage] || 0) + 1;
        });

        return {
          success: true,
          data: summary,
          message: `📊 *PIPELINE*\n\n💰 Total em negociação: R$ ${summary.total_value.toLocaleString("pt-BR")}\n📋 Deals ativos: ${summary.total_deals}\n✅ Ganhos: ${summary.won}\n🔄 Em negociação: ${summary.negotiation}`,
        };
      }

      case "leads_hot": {
        const { data: leads } = await supabase
          .from("leads")
          .select("name, phone, sales_score, sales_stage, updated_at")
          .gte("sales_score", 70)
          .order("sales_score", { ascending: false })
          .limit(filters?.limit || 10);

        const list = leads?.map((l: any) => `• ${l.name} (${l.sales_score}pts) - ${l.sales_stage}`).join("\n") || "Nenhum";

        return {
          success: true,
          data: leads,
          message: `🔥 *LEADS QUENTES*\n\n${list}`,
        };
      }

      case "deals_open": {
        const { data: deals } = await supabase
          .from("deals")
          .select("negotiated_price, lead:leads(name), pipeline_stage:sales_pipeline_stages(name)")
          .eq("status", "negotiation")
          .order("negotiated_price", { ascending: false })
          .limit(filters?.limit || 10);

        const list = deals?.map((d: any) =>
          `• ${d.lead?.name} - R$ ${Number(d.negotiated_price).toLocaleString("pt-BR")} (${d.pipeline_stage?.name})`
        ).join("\n") || "Nenhum";

        const total = deals?.reduce((sum: number, d: any) => sum + (Number(d.negotiated_price) || 0), 0) || 0;

        return {
          success: true,
          data: deals,
          message: `💼 *DEALS EM ABERTO*\n\n${list}\n\n💰 Total: R$ ${total.toLocaleString("pt-BR")}`,
        };
      }

      case "tasks_pending": {
        let query = supabase
          .from("company_activities")
          .select("name, task_type, due_datetime, priority, responsavel:team_members!company_activities_responsavel_id_fkey(name)")
          .eq("completed", false)
          .order("due_datetime", { ascending: true })
          .limit(filters?.limit || 10);

        if (filters?.responsavel) {
          const resp = await findResponsavel(supabase, filters.responsavel);
          if (resp) {
            query = query.eq("responsavel_id", resp.id);
          }
        }

        const { data: tasks } = await query;

        const list = tasks?.map((t: any) => {
          const date = t.due_datetime ? new Date(t.due_datetime).toLocaleDateString("pt-BR") : "Sem data";
          return `• ${t.name} (${t.task_type}) - ${date} - ${t.responsavel?.nome || "Sem resp."}`;
        }).join("\n") || "Nenhuma";

        return {
          success: true,
          data: tasks,
          message: `📋 *TAREFAS PENDENTES*\n\n${list}`,
        };
      }

      case "lead_info": {
        if (!filters?.name && !filters?.phone) {
          return { success: false, error: "Informe nome ou telefone do lead" };
        }

        const lead = await findLead(supabase, filters.name || filters.phone);
        if (!lead) {
          return { success: false, error: "Lead não encontrado" };
        }

        // Buscar deals do lead
        const { data: deals } = await supabase
          .from("deals")
          .select("negotiated_price, status, pipeline_stage:sales_pipeline_stages(name)")
          .eq("lead_id", lead.id);

        const dealInfo = deals?.map((d: any) =>
          `  • R$ ${Number(d.negotiated_price).toLocaleString("pt-BR")} - ${d.status} (${d.pipeline_stage?.name})`
        ).join("\n") || "  Nenhum";

        return {
          success: true,
          data: { lead, deals },
          message: `👤 *${lead.name}*\n\n📱 ${lead.phone || "Sem telefone"}\n📧 ${lead.email || "Sem email"}\n📸 ${lead.instagram || "Sem instagram"}\n📊 Score: ${lead.sales_score || 0}\n📍 Estágio: ${lead.sales_stage || "Não definido"}\n\n💼 *Oportunidades:*\n${dealInfo}`,
        };
      }

      case "deal_info": {
        if (!filters?.name && !filters?.deal_id) {
          return { success: false, error: "Informe nome do cliente ou ID do deal" };
        }

        // Buscar deal com todos os dados relacionados
        const deal = await findDeal(supabase, filters.deal_id || filters.name);
        if (!deal) {
          return { success: false, error: "Oportunidade não encontrada" };
        }

        // Buscar dados completos do deal
        const { data: fullDeal, error: dealError } = await supabase
          .from("deals")
          .select(`
            *,
            lead:leads(id, name, phone, email, instagram, sales_score, sales_stage, context, bant_budget, bant_authority, bant_need, bant_timeline),
            product:products(name, price),
            pipeline_stage:sales_pipeline_stages(name, position),
            sales_rep:team_members(name)
          `)
          .eq("id", deal.id)
          .single();

        if (dealError || !fullDeal) {
          console.error("Erro ao buscar deal completo:", dealError);
          return { success: false, error: `Erro ao buscar dados: ${dealError?.message || "deal não encontrado"}` };
        }

        // Buscar atividades/tarefas relacionadas ao lead
        const { data: tasks } = await supabase
          .from("company_activities")
          .select("name, task_type, status, due_datetime, completed")
          .eq("lead_id", fullDeal.lead?.id)
          .order("due_datetime", { ascending: false })
          .limit(5);

        // Calcular dias desde criação
        const createdAt = new Date(fullDeal.created_at);
        const now = new Date();
        const daysOpen = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

        // Formatar valores
        const valorNegociado = Number(fullDeal.negotiated_price) || 0;
        const valorOriginal = Number(fullDeal.original_price) || 0;
        const desconto = Number(fullDeal.discount_percent) || 0;
        const probabilidade = fullDeal.ai_win_probability || 0;

        // Status emoji
        const statusEmoji = fullDeal.status === "won" ? "🏆" : fullDeal.status === "lost" ? "❌" : "🔄";
        const statusText = fullDeal.status === "won" ? "GANHO" : fullDeal.status === "lost" ? "PERDIDO" : "EM NEGOCIAÇÃO";

        // Formatar tarefas
        const tasksList = tasks?.map((t: any) => {
          const status = t.completed ? "✅" : t.status === "in_progress" ? "🔄" : "⏳";
          return `  ${status} ${t.name} (${t.task_type})`;
        }).join("\n") || "  Nenhuma tarefa";

        // BANT do lead
        const lead = fullDeal.lead as any;
        const bantItems = [];
        if (lead?.bant_budget) bantItems.push("💰 Budget");
        if (lead?.bant_authority) bantItems.push("👔 Authority");
        if (lead?.bant_need) bantItems.push("🎯 Need");
        if (lead?.bant_timeline) bantItems.push("📅 Timeline");
        const bantText = bantItems.length > 0 ? bantItems.join(" | ") : "Não qualificado";

        // Previsão de fechamento
        const previsao = fullDeal.expected_close_date
          ? new Date(fullDeal.expected_close_date).toLocaleDateString("pt-BR")
          : "Não definida";

        // Construir mensagem conversacional
        let message = "";

        if (fullDeal.status === "won") {
          message = `Opa! O deal do *${lead?.name}* já foi fechado! 🎉\n\nFechamos por R$ ${valorNegociado.toLocaleString("pt-BR")}${desconto > 0 ? ` (demos ${desconto}% de desconto)` : ""} no dia ${new Date(fullDeal.won_at).toLocaleDateString("pt-BR")}. Produto: ${fullDeal.product?.name || "não especificado"}.`;
        } else if (fullDeal.status === "lost") {
          message = `Infelizmente perdemos o deal do *${lead?.name}* 😔\n\nMotivo: ${fullDeal.lost_reason || "não informado"}. Era um deal de R$ ${valorNegociado.toLocaleString("pt-BR")}.`;
        } else {
          // Em negociação - resposta mais completa
          message = `Beleza, achei aqui! 📋\n\n`;
          message += `O deal do *${lead?.name}* tá na etapa *${fullDeal.pipeline_stage?.name || "inicial"}*`;
          message += probabilidade > 0 ? ` com ${probabilidade}% de chance de fechar.\n\n` : `.\n\n`;

          message += `💰 *Sobre o valor:*\n`;
          message += `Tamo negociando R$ ${valorNegociado.toLocaleString("pt-BR")}`;
          if (desconto > 0) {
            message += ` (original era R$ ${valorOriginal.toLocaleString("pt-BR")}, ${desconto}% off)`;
          }
          if (fullDeal.payment_method) {
            message += `\nForma de pagamento: ${fullDeal.payment_method}`;
            if (fullDeal.installments > 1) message += ` em ${fullDeal.installments}x`;
          }

          message += `\n\n👤 *Sobre o cliente:*\n`;
          message += `${lead?.name}`;
          if (lead?.phone) message += ` - ${lead.phone}`;
          if (lead?.email) message += `\nEmail: ${lead.email}`;
          message += `\nScore: ${lead?.sales_score || 0}/100`;
          if (bantItems.length > 0) {
            message += ` | BANT: ${bantItems.length}/4 ✓`;
          }

          if (fullDeal.product?.name) {
            message += `\n\n📦 Produto: ${fullDeal.product.name}`;
          }
          if (fullDeal.sales_rep?.name) {
            message += `\n👔 Vendedor: ${fullDeal.sales_rep.name}`;
          }

          message += `\n\n📅 Tá aberto há ${daysOpen} dias`;
          if (fullDeal.expected_close_date) {
            message += ` | Previsão de fechar: ${previsao}`;
          }

          if (tasks && tasks.length > 0) {
            const pendingTasks = tasks.filter((t: any) => !t.completed);
            if (pendingTasks.length > 0) {
              message += `\n\n📝 *Tarefas pendentes:*\n`;
              pendingTasks.slice(0, 3).forEach((t: any) => {
                message += `• ${t.name}\n`;
              });
            }
          }

          if (fullDeal.notes) {
            message += `\n💬 *Obs:* ${fullDeal.notes}`;
          }

          // Dica contextual
          if (daysOpen > 30 && fullDeal.status === "negotiation") {
            message += `\n\n⚠️ Esse deal tá parado há mais de 1 mês, hein! Bora dar uma atenção?`;
          } else if (probabilidade >= 70) {
            message += `\n\n🔥 Probabilidade alta! Tá quase lá!`;
          } else if (probabilidade > 0 && probabilidade < 30) {
            message += `\n\n💡 Probabilidade baixinha ainda, precisa trabalhar mais esse lead.`;
          }
        }

        message = message.trim();

        return {
          success: true,
          data: { deal: fullDeal, tasks },
          message,
        };
      }

      case "team_tasks": {
        const today = new Date().toISOString().split("T")[0];

        const { data: tasks } = await supabase
          .from("company_activities")
          .select("name, task_type, due_datetime, responsavel:team_members!company_activities_responsavel_id_fkey(name)")
          .eq("completed", false)
          .gte("due_datetime", `${today}T00:00:00`)
          .lte("due_datetime", `${today}T23:59:59`)
          .order("due_datetime", { ascending: true });

        const list = tasks?.map((t: any) => {
          const time = t.due_datetime ? new Date(t.due_datetime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
          return `• ${time} - ${t.name} (${t.responsavel?.name || "?"})`;
        }).join("\n") || "Nenhuma tarefa para hoje";

        return {
          success: true,
          data: tasks,
          message: `📅 *AGENDA DE HOJE*\n\n${list}`,
        };
      }

      default:
        return { success: false, error: `Tipo de query não suportado: ${queryType}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ==================== MAIN HANDLER ====================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();

    // Modo de teste manual
    if (body.test) {
      console.log("🧪 Modo de teste ativado");

      const { message, groupId } = body;

      const { data: config } = await supabase
        .from("whatsapp_task_bot_config")
        .select("*")
        .limit(1)
        .single();

      if (!config) {
        return new Response(
          JSON.stringify({ error: "Configuração do bot não encontrada" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const { data: contextMsgs } = await supabase
        .from("whatsapp_messages")
        .select("content, sender_name, sent_at")
        .eq("group_id", groupId)
        .order("sent_at", { ascending: false })
        .limit(config.context_messages_count);

      const contextMessages = (contextMsgs || []).reverse();

      // Usar prompt configurável + técnico
      const aiResponse = await callClaude(
        supabase,
        buildSystemPrompt(config.ai_prompt),
        contextMessages,
        message,
        "Teste Manual"
      );

      return new Response(
        JSON.stringify({
          success: true,
          aiResponse,
          contextMessages: contextMessages.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Webhook real do WhatsApp
    const messageData = body.data || body;
    const metadata = messageData.metadata || messageData;

    const isGroup = metadata?.isGroup || metadata?.chatid?.includes("@g.us");
    if (!isGroup) {
      console.log("⏭️ Não é mensagem de grupo, ignorando");
      return new Response(
        JSON.stringify({ ignored: true, reason: "not_group" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: config } = await supabase
      .from("whatsapp_task_bot_config")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!config) {
      console.log("⏭️ Bot não está ativo");
      return new Response(
        JSON.stringify({ ignored: true, reason: "bot_inactive" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mentionedJIDs = metadata?.content?.contextInfo?.mentionedJID || [];
    const botMentioned = mentionedJIDs.some((jid: string) =>
      jid.startsWith(config.bot_mention_id)
    );

    if (!botMentioned) {
      console.log("⏭️ Bot não foi mencionado");
      return new Response(
        JSON.stringify({ ignored: true, reason: "not_mentioned" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const remoteJid = metadata.chatid || messageData.remote_jid;
    const { data: group } = await supabase
      .from("whatsapp_groups")
      .select("id, name, group_jid, instance_id")
      .eq("group_jid", remoteJid)
      .single();

    if (!group) {
      console.log("⏭️ Grupo não encontrado no banco:", remoteJid);
      return new Response(
        JSON.stringify({ ignored: true, reason: "group_not_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.enabled_group_ids.includes(group.id)) {
      console.log("⏭️ Grupo não está habilitado:", group.name);
      return new Response(
        JSON.stringify({ ignored: true, reason: "group_not_enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🤖 Carol mencionada no grupo "${group.name}" - processando...`);

    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("id, api_key, api_url")
      .eq("id", group.instance_id)
      .single();

    const { data: contextMsgs } = await supabase
      .from("whatsapp_messages")
      .select("content, sender_name, sent_at")
      .eq("group_id", group.id)
      .order("sent_at", { ascending: false })
      .limit(config.context_messages_count);

    const contextMessages = (contextMsgs || []).reverse();

    const triggerContent = metadata.text || metadata.content?.text || messageData.content;
    const senderName = metadata.senderName || messageData.sender_name || "Usuário";
    const senderPhone = metadata.sender_pn?.replace("@s.whatsapp.net", "") || messageData.sender_phone;

    // Chamar IA com SUPER PROMPT
    let aiResponse: any;
    let actionTaken: string = "ignored";
    let resultData: any = null;
    let responseMessage: string = "";
    let errorMsg: string | null = null;

    try {
      aiResponse = await callClaude(
        supabase,
        buildSystemPrompt(config.ai_prompt),
        contextMessages,
        triggerContent,
        senderName
      );

      console.log("🤖 Resposta da IA:", JSON.stringify(aiResponse, null, 2));

      // ========== PROCESSAR ACTIONS ==========

      if (aiResponse.action === "create_task") {
        let responsavelId: string | undefined;
        if (aiResponse.task?.responsavel_name) {
          const resp = await findResponsavel(supabase, aiResponse.task.responsavel_name);
          responsavelId = resp?.id;
        }
        if (!responsavelId && config.auto_assign_to_sender && senderPhone) {
          const resp = await findResponsavel(supabase, undefined, senderPhone);
          responsavelId = resp?.id;
        }

        const result = await handleCreateTask(supabase, aiResponse.task, responsavelId, group.id);
        if (result.success) {
          actionTaken = "task_created";
          resultData = result.data;
          responseMessage = aiResponse.message || `✅ Tarefa criada: *${result.data.name}*`;
        } else {
          throw new Error(result.error);
        }

      } else if (aiResponse.action === "create_lead") {
        const result = await handleCreateLead(supabase, aiResponse.lead);
        if (result.success) {
          actionTaken = "lead_created";
          resultData = result.data;
          responseMessage = aiResponse.message || `✅ Lead criado: *${result.data.name}*`;
        } else {
          throw new Error(result.error);
        }

      } else if (aiResponse.action === "create_deal") {
        const result = await handleCreateDeal(supabase, aiResponse.deal);
        if (result.success) {
          actionTaken = "deal_created";
          resultData = result.data;
          responseMessage = aiResponse.message || `✅ Oportunidade criada: R$ ${Number(result.data.negotiated_price).toLocaleString("pt-BR")}`;
        } else {
          throw new Error(result.error);
        }

      } else if (aiResponse.action === "create_lead_and_deal") {
        // Criar lead primeiro
        const leadResult = await handleCreateLead(supabase, aiResponse.lead);
        if (!leadResult.success) {
          throw new Error(`Erro ao criar lead: ${leadResult.error}`);
        }

        // Criar deal com o lead_id
        const dealData = { ...aiResponse.deal, lead_id: leadResult.data.id };
        const dealResult = await handleCreateDeal(supabase, dealData);
        if (!dealResult.success) {
          throw new Error(`Erro ao criar deal: ${dealResult.error}`);
        }

        actionTaken = "lead_and_deal_created";
        resultData = { lead: leadResult.data, deal: dealResult.data };
        responseMessage = aiResponse.message || `✅ Lead *${leadResult.data.name}* + Oportunidade R$ ${Number(dealResult.data.negotiated_price).toLocaleString("pt-BR")} criados!`;

      } else if (aiResponse.action === "update_lead") {
        const result = await handleUpdateLead(supabase, aiResponse.lead_identifier, aiResponse.updates);
        if (result.success) {
          actionTaken = "lead_updated";
          resultData = result.data;
          responseMessage = aiResponse.message || `✅ Lead atualizado: *${result.data.name}*`;
        } else {
          throw new Error(result.error);
        }

      } else if (aiResponse.action === "update_deal") {
        const result = await handleUpdateDeal(supabase, aiResponse.deal_identifier, aiResponse.updates);
        if (result.success) {
          actionTaken = "deal_updated";
          resultData = result.data;
          responseMessage = aiResponse.message || `✅ Deal atualizado!`;
        } else {
          throw new Error(result.error);
        }

      } else if (aiResponse.action === "query_data") {
        const result = await handleQueryData(supabase, aiResponse.query_type, aiResponse.filters || {});
        if (result.success) {
          actionTaken = "query_executed";
          resultData = result.data;
          responseMessage = result.message || aiResponse.message || "Dados consultados!";
        } else {
          throw new Error(result.error);
        }

      } else if (aiResponse.action === "ask_question") {
        actionTaken = "question_asked";
        responseMessage = `❓ ${aiResponse.question}`;
      }

      // Enviar resposta no grupo
      if (responseMessage && instance) {
        await sendGroupMessage(instance, remoteJid, responseMessage);
      }

    } catch (aiError: any) {
      console.error("❌ Erro ao processar:", aiError);
      actionTaken = "error";
      errorMsg = aiError.message || String(aiError);

      if (instance) {
        await sendGroupMessage(
          instance,
          remoteJid,
          `❌ Ops, deu ruim: ${errorMsg}`
        );
      }
    }

    // Salvar log
    await supabase.from("whatsapp_task_bot_logs").insert({
      config_id: config.id,
      group_id: group.id,
      trigger_message_id: messageData.id || null,
      trigger_content: triggerContent,
      sender_name: senderName,
      sender_phone: senderPhone,
      context_messages: contextMessages,
      ai_response: aiResponse,
      action_taken: actionTaken,
      task_id: resultData?.id || null,
      response_message: responseMessage,
      error: errorMsg,
    });

    return new Response(
      JSON.stringify({
        success: true,
        action: actionTaken,
        data: resultData,
        responseMessage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ Erro geral:", error);
    return new Response(
      JSON.stringify({ error: error.message || String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
