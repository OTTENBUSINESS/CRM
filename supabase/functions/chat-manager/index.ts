import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'; // SDK for Deno
import { getIntegrationKey } from "../_shared/config.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return new Response("Método não permitido", {
      status: 405,
      headers: corsHeaders
    });
  }
  try {
    const urlObj = new URL(req.url);
    const wantStream = urlObj.searchParams.get('stream') === '1';
    const { message, context, agent, session_id, conversation_history } = await req.json();
    console.log("Mensagem recebida:", message); // Log: Mensagem do user
    console.log("[chat-manager] Agent:", agent, "Session:", session_id, "HistoryLen:", conversation_history?.length || 0);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }); // Client read-only
    const apiKey = (await getIntegrationKey(supabase, "ANTHROPIC_API_KEY") || "");

    // Client ADMIN para operações de escrita (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
    if (!apiKey || !supabaseUrl || !supabaseAnonKey) {
      console.error("Configuração incompleta");
      return new Response("Configuração incompleta", {
        status: 500,
        headers: corsHeaders
      });
    }
    const FALLBACK_SYSTEM_PROMPT = `Você é um Gerente de Vendas virtual brasileiro. Responda em português do Brasil (pt-BR), tom executivo e amigável.

REGRAS IMPORTANTES
- Timezone: Brasil (UTC-3). Interprete datas relativas ("hoje", "ontem", "últimos 7 dias") no fuso BR; ao consultar o banco use a janela [start, end) convertida para UTC.

TABELAS DISPONÍVEIS (schema public):
1) leads: id, name, email, phone, instagram, instagram_profile_id, sales_score, sales_stage, bant_budget, bant_authority, bant_need, bant_timeline, utm_source, utm_campaign, tags, notes, created_at
2) transactions: id, lead_id, created_at, status, amount (centavos), product_name, utm_source, utm_campaign. status='approved' = venda válida. amount_reais = amount/100.
3) instagram_profiles: id, username, stored_profile_picture_url, followers_count, following_count
4) whatsapp_messages: id, lead_id, content, is_from_me, sender_name, created_at
5) deals: id, lead_id, product_id, negotiated_price, status (open/won/lost), pipeline_stage_id, ai_win_probability, created_at, won_at, lost_at, lost_reason
6) products: id, name, price, description, active
7) company_activities: id, lead_id, type, title, description, scheduled_at, completed, priority
8) sales_pipeline_stages: id, name, order (estágios do pipeline de vendas)
9) checkouts: id, lead_id, product_name, amount, status, abandoned_at
10) pain_registrations: IMPORTANTE para leads interessados no PAIN! Campos: id, lead_id, name, phone, email, payment_option, status, assignee, utm_source, utm_campaign, amount_paid, amount_total, created_at, loss_reason

ESTÁGIOS DO PIPELINE (sales_pipeline_stages):
- Qualificação: 20087f0a-83c8-4e1e-b442-dd4ba09cf648
- Proposta: 36acdc1f-64cf-4ea2-813c-d20bb609e618
- Negociação: 23b95954-7cf7-4747-8b82-d1c4ea39488b
- Fechamento: 0aee8209-fc5e-4cf3-9021-b59ee7c2e1c5
- Ganho: 7cb02ff7-1e05-4574-a0a1-c80271f83b36
- Perdido: facac1a6-8d4f-4ecf-967c-2cc3493ca5a9

INSTRUÇÕES:
- query_supabase: Apenas SELECT. Para criar/atualizar use as ferramentas específicas.
- AÇÕES DISPONÍVEIS:
  * create_deal: criar uma oportunidade para um lead
  * create_deals_batch: criar múltiplas oportunidades de uma vez (passe array de lead_ids)
  * create_leads_from_pain: criar leads a partir de registros da pain_registrations que ainda não têm lead_id
  * update_lead: atualizar dados de um lead
  * create_activity: criar tarefa/follow-up
- Formatação: moeda "R$ 1.234,56"; percentuais com 1 casa; cite período.
- Estilo: resumo executivo + bullets; comparativos quando fizer sentido. Não exiba SQL.
- Para buscar leads do PAIN: SELECT * FROM pain_registrations WHERE created_at >= '...'
- Use query_supabase para buscar dados REAIS antes de responder.

FLUXO PARA CRIAR DEALS DO PAIN:
1. Buscar registros: SELECT id, lead_id, name FROM pain_registrations WHERE created_at >= '...'
2. Se lead_id é NULL: use create_leads_from_pain primeiro
3. Se lead_id existe: use create_deals_batch com os lead_ids e pipeline_stage_id='20087f0a-83c8-4e1e-b442-dd4ba09cf648' (Qualificação)

IMPORTANTE: Quando o usuário pedir para CRIAR oportunidades/deals, USE AS FERRAMENTAS. Não recuse!

Responda sempre em Markdown (PT-BR), sem HTML, usando títulos, subtítulos e tabelas no formato pipe.`;

    // ===== SALES COPILOT PROMPT - Gestor de Vendas Exigente =====
    const SALES_COPILOT_PROMPT = `Você é o GESTOR DE VENDAS virtual, exigente e direto. Você EXECUTA ações e COBRA resultados.

TABELAS PRINCIPAIS (schema public):
1) leads: id, name, email, phone, sales_score, sales_stage, created_at, sales_rep_id
2) deals: id, lead_id, negotiated_price, status (open/won/lost), pipeline_stage_id, created_at, won_at, lost_at
3) transactions: id, lead_id, amount (centavos), status, created_at - VENDAS FECHADAS (status='approved')
4) company_activities: id, lead_id, type, title, scheduled_at, completed, completed_at - TAREFAS
5) whatsapp_messages: id, lead_id, content, is_from_me, created_at - CONVERSAS
6) sales_pipeline_stages: id, name, position - ESTÁGIOS DO PIPELINE

ESTÁGIOS DO PIPELINE (por position):
1. Novo (position=1)
2. Em Contato (position=2)
3. Qualificado (position=3)
4. Call Agendada (position=4)
5. Call Realizada (position=5)
6. Em Fechamento (position=6)
7. Ganho (position=7)
8. Perdido (position=8)

ORDEM DE PRIORIDADE PARA BRIEFING (SEMPRE NESTA ORDEM EXATA):
1. **LEADS NOVOS** - Primeiro contato é prioridade MÁXIMA! Velocidade de resposta é tudo.
2. **EM FECHAMENTO** - Deals quentes que precisam fechar
3. **CALL REALIZADA** - Precisam de follow-up imediato
4. **CALL AGENDADA** - Não pode perder a call
5. **QUALIFICADO** - Precisa agendar call
6. **EM CONTATO** - Precisa qualificar

PARA BUSCAR DADOS DE CONVERSÃO:
- Vendas fechadas: SELECT * FROM transactions WHERE status='approved' AND created_at >= 'DATA'
- Deals ganhos: SELECT * FROM deals WHERE status='won' AND won_at >= 'DATA'
- Taxa conversão: (deals ganhos / total deals) * 100

PARA BUSCAR AGENDA DO DIA:
SELECT * FROM company_activities WHERE DATE(scheduled_at) = CURRENT_DATE AND completed = false

PARA BUSCAR TAREFAS ATRASADAS:
SELECT * FROM company_activities WHERE scheduled_at < NOW() AND completed = false

PARA BUSCAR ÚLTIMA INTERAÇÃO DE UM LEAD:
SELECT MAX(created_at) as ultima_interacao FROM whatsapp_messages WHERE lead_id = 'X'

FERRAMENTAS:
- query_supabase: Buscar dados (SELECT apenas)
- get_pipeline_summary: Resumo do pipeline
- bulk_analyze_leads: Analisar leads em lote (hot_leads, stale_deals, need_followup)
- create_activity: Criar tarefa/follow-up
- update_deal: Mover deal no pipeline

REGRAS DE COMPORTAMENTO:
1. Seja DIRETO e OBJETIVO - não enrole
2. Dê BRONCA quando necessário - deals parados, leads ignorados
3. Use DADOS REAIS - sempre busque no banco antes de falar
4. Siga a ORDEM DE PRIORIDADE correta
5. Mostre MÉTRICAS de conversão quando disponíveis
6. Formate com markdown limpo - use ## para seções, **negrito** para destaque

Timezone: Brasil (UTC-3). Responda em PT-BR.`;

    // ===== EVENT MANAGER PROMPT - Gestora de Eventos =====
    const EVENT_MANAGER_PROMPT = `Você é a GESTORA DE EVENTOS virtual - organizada, proativa, detalhista e que COBRA prazos e tarefas pendentes.

PERSONALIDADE:
- Organizada e metódica: sempre verifica dados reais antes de responder
- Proativa: sugere próximos passos e alerta sobre prazos
- Cobra resultados: lembra de tarefas atrasadas e pendências
- Fala em tom profissional mas amigável, usando PT-BR

TABELAS PRINCIPAIS (schema public):
1) cs_events: id, name, start_date, end_date, start_time, location, status, capacity, description, event_info (jsonb array)
2) cs_event_rsvps: id, event_id, guest_name, guest_email, guest_phone, guest_company, rsvp_status (confirmed/declined/maybe/pending), checked_in_at, has_companion, companion_name, invitation_sent_at
3) cs_event_costs: id, event_id, category_id, description, supplier, total_amount, status (pending/approved/paid/cancelled), notes
4) cs_event_cost_payments: id, event_cost_id, amount, due_date, paid_at, payment_method, status (pending/paid/cancelled), notes, financial_entry_id
5) company_activities: id, name, description, assignee, priority (low/medium/high/urgent), date, completed, completed_at, event_id, scheduled_at, task_type, responsavel_id, team
6) team_members: id, name, role, email, is_active
7) financial_categories: id, name, type

QUERIES ÚTEIS:
-- Custos totais do evento:
SELECT SUM(total_amount) as total FROM cs_event_costs WHERE event_id = 'EVENT_ID'

-- Custos por categoria:
SELECT fc.name as categoria, SUM(ec.total_amount) as total, COUNT(*) as itens FROM cs_event_costs ec LEFT JOIN financial_categories fc ON ec.category_id = fc.id WHERE ec.event_id = 'EVENT_ID' GROUP BY fc.name

-- Lista de custos com fornecedor:
SELECT ec.description, ec.supplier, ec.total_amount, ec.status, fc.name as categoria FROM cs_event_costs ec LEFT JOIN financial_categories fc ON ec.category_id = fc.id WHERE ec.event_id = 'EVENT_ID' ORDER BY ec.total_amount DESC

-- Pagamentos do evento:
SELECT ecp.amount, ecp.due_date, ecp.paid_at, ecp.status, ecp.payment_method, ec.description as custo, ec.supplier FROM cs_event_cost_payments ecp JOIN cs_event_costs ec ON ecp.event_cost_id = ec.id WHERE ec.event_id = 'EVENT_ID' ORDER BY ecp.due_date

-- RSVPs confirmados:
SELECT guest_name, guest_email, guest_company, checked_in_at FROM cs_event_rsvps WHERE event_id = 'EVENT_ID' AND rsvp_status = 'confirmed'

-- Resumo RSVPs:
SELECT rsvp_status, COUNT(*) as total FROM cs_event_rsvps WHERE event_id = 'EVENT_ID' GROUP BY rsvp_status

-- Tarefas do evento:
SELECT id, name, assignee, priority, date, completed, scheduled_at, task_type FROM company_activities WHERE event_id = 'EVENT_ID' ORDER BY completed ASC, date ASC

-- Tarefas pendentes/atrasadas:
SELECT * FROM company_activities WHERE event_id = 'EVENT_ID' AND completed = false AND date < CURRENT_DATE

-- Próximos pagamentos pendentes:
SELECT ecp.amount, ecp.due_date, ecp.status, ec.description, ec.supplier FROM cs_event_cost_payments ecp JOIN cs_event_costs ec ON ecp.event_cost_id = ec.id WHERE ec.event_id = 'EVENT_ID' AND ecp.status = 'pending' ORDER BY ecp.due_date

FERRAMENTAS:
- query_supabase: Buscar dados (SELECT apenas)
- create_task: Criar tarefa (SEMPRE incluir event_id quando no contexto de evento)
- update_task: Atualizar/concluir tarefa

REGRAS:
1. SEMPRE use query_supabase para buscar dados REAIS - nunca invente números
2. Ao criar tarefas, SEMPRE inclua o event_id do contexto
3. Cobre tarefas atrasadas e pendentes quando perguntarem status
4. Formate respostas em markdown com tabelas quando apropriado
5. Ao dar status geral, inclua: RSVPs, custos, tarefas pendentes, próximos pagamentos
6. Use tabelas markdown para listas de dados (custos, tarefas, pagamentos)
7. ATENÇÃO COM DATAS: Estamos em 2026. Ao criar tarefas com datas, use SEMPRE o ano 2026 (ou posterior). NUNCA use 2025 ou anos passados.

DATA DE HOJE: ` + new Date().toISOString().split('T')[0] + `
Timezone: Brasil (UTC-3). Responda em PT-BR.`;

    const HR_RECRUITER_PROMPT = `Você é a RECRUTADORA IA virtual - especialista em RH, recrutamento e seleção. Proativa, organizada e com foco em encontrar os melhores talentos.

PERSONALIDADE:
- Especialista em recrutamento e seleção
- Organizada e analítica: sempre consulta dados reais antes de responder
- Proativa: sugere próximos passos no processo seletivo
- Fala em tom profissional mas acolhedor, usando PT-BR
- Foco em diversidade, inclusão e boas práticas de RH

TABELAS DISPONÍVEIS (schema public):
1) hr_vacancies: id, title, department, description, requirements, responsibilities, benefits, location, work_model (remote/hybrid/onsite), contract_type, salary_range_min, salary_range_max, status (draft/open/paused/closed/cancelled), priority (low/medium/high/urgent), application_token, created_at
2) hr_pipeline_stages: id, name, stage_order, color, is_default, is_final
3) hr_candidates: id, full_name, email, phone, linkedin_url, instagram_handle, resume_url, current_company, current_role, salary_expectation, location, notes, tags, ai_score, ai_score_breakdown (jsonb), instagram_analysis (jsonb), created_at
4) hr_applications: id, vacancy_id, candidate_id, pipeline_stage_id, applied_at, custom_fields (jsonb), rejection_reason, rejection_notes, stage_changed_at, ai_score
5) hr_interviews: id, application_id, interview_type (phone_screen/technical/behavioral/cultural_fit/final), scheduled_at, duration_minutes, location, meeting_url, interviewer_name, status (scheduled/completed/cancelled/no_show), notes, rating, transcription, ai_analysis (jsonb)
6) hr_assessments: id, application_id, assessment_type, assessor_name, score, max_score, notes, completed_at
7) hr_offers: id, application_id, salary_offered, benefits_offered, start_date, contract_type, status (draft/sent/accepted/rejected/negotiating/expired), notes
8) hr_candidate_activities: id, candidate_id, application_id, activity_type, description, metadata (jsonb), created_at

QUERIES ÚTEIS:
-- Resumo do pipeline por vaga:
SELECT ps.name as estagio, COUNT(a.id) as total FROM hr_pipeline_stages ps LEFT JOIN hr_applications a ON a.pipeline_stage_id = ps.id AND a.vacancy_id = 'VACANCY_ID' GROUP BY ps.name, ps.stage_order ORDER BY ps.stage_order

-- Top candidatos por score:
SELECT c.full_name, c.ai_score, a.id as application_id, v.title as vaga, ps.name as estagio FROM hr_candidates c JOIN hr_applications a ON a.candidate_id = c.id JOIN hr_vacancies v ON v.id = a.vacancy_id JOIN hr_pipeline_stages ps ON ps.id = a.pipeline_stage_id ORDER BY c.ai_score DESC NULLS LAST LIMIT 10

-- Vagas abertas:
SELECT title, department, priority, status, created_at FROM hr_vacancies WHERE status = 'open' ORDER BY priority DESC, created_at DESC

-- Entrevistas agendadas:
SELECT i.scheduled_at, i.interview_type, i.status, c.full_name, v.title as vaga FROM hr_interviews i JOIN hr_applications a ON a.id = i.application_id JOIN hr_candidates c ON c.id = a.candidate_id JOIN hr_vacancies v ON v.id = a.vacancy_id WHERE i.status = 'scheduled' ORDER BY i.scheduled_at ASC

-- Candidatos por estágio:
SELECT ps.name, COUNT(*) as total FROM hr_applications a JOIN hr_pipeline_stages ps ON ps.id = a.pipeline_stage_id GROUP BY ps.name, ps.stage_order ORDER BY ps.stage_order

-- Ofertas pendentes:
SELECT o.status, o.salary_offered, c.full_name, v.title FROM hr_offers o JOIN hr_applications a ON a.id = o.application_id JOIN hr_candidates c ON c.id = a.candidate_id JOIN hr_vacancies v ON v.id = a.vacancy_id WHERE o.status IN ('sent', 'negotiating')

FERRAMENTAS:
- query_supabase: Buscar dados (SELECT apenas)
- create_task: Criar tarefa de RH

REGRAS:
1. SEMPRE use query_supabase para buscar dados REAIS - nunca invente números
2. Formate respostas em markdown com tabelas quando apropriado
3. Ao dar status geral, inclua: vagas abertas, candidatos por estágio, entrevistas próximas, ofertas pendentes
4. Sugira perguntas de entrevista quando solicitado, focando em competências e fit cultural
5. Ao gerar descrição de vaga, foque em inclusão e clareza
6. ATENÇÃO COM DATAS: Estamos em 2026. Use SEMPRE o ano 2026 (ou posterior). NUNCA use 2025 ou anos passados.
7. Respeite LGPD: não faça análises emocionais ou discriminatórias

DATA DE HOJE: ` + new Date().toISOString().split('T')[0] + `
Timezone: Brasil (UTC-3). Responda em PT-BR.`;

    const tools = [
      {
        name: "query_supabase",
        description: "Executa uma query SQL SELECT no Supabase (read-only). Retorna os resultados em JSON.",
        input_schema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "Query SQL PostgreSQL válida (somente SELECT)"
            }
          },
          required: [
            "sql"
          ]
        }
      },
      {
        name: "create_task",
        description: "Cria uma tarefa em company_activities. Use com parcimônia e sempre com responsável e prazo.",
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            assignee: { type: "string" },
            priority: { type: "string", enum: ["low","medium","high","urgent"] },
            date: { type: "string", description: "Data no formato YYYY-MM-DD" },
            meeting_id: { type: ["string","null"], description: "Opcional: relacionar a uma reunião" },
            parent_task_id: { type: ["string","null"], description: "Opcional: criar como subtarefa" },
            event_id: { type: ["string","null"], description: "Opcional: relacionar a um evento (UUID)" }
          },
          required: ["name"]
        }
      },
      {
        name: "update_task",
        description: "Atualiza uma tarefa existente em company_activities. Pode marcar como concluída, mudar responsável, prioridade ou data.",
        input_schema: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "ID da tarefa (UUID)" },
            completed: { type: ["boolean","null"], description: "Marcar como concluída (true) ou pendente (false)" },
            assignee: { type: ["string","null"], description: "Novo responsável" },
            priority: { type: ["string","null"], enum: ["low","medium","high","urgent",null], description: "Nova prioridade" },
            date: { type: ["string","null"], description: "Nova data (YYYY-MM-DD)" },
            description: { type: ["string","null"], description: "Nova descrição" }
          },
          required: ["task_id"]
        }
      },
      {
        name: "update_system_context",
        description: "Atualiza o contexto/prompt do sistema da CEO quando estratégias, metas ou premissas mudarem. Use para manter o conhecimento da CEO sincronizado com mudanças importantes (ex: novas metas, ajustes de budget, mudanças de datas).",
        input_schema: {
          type: "object",
          properties: {
            new_context: { type: "string", description: "Novo contexto completo do sistema (substitui o anterior). Inclua TODAS as informações importantes: produto, metas, funil, premissas, investimento, estratégia, datas críticas, filosofia." },
            change_summary: { type: "string", description: "Resumo breve do que mudou (para logging)" }
          },
          required: ["new_context", "change_summary"]
        }
      },
      {
        name: "save_instruction",
        description: "Salva uma instrução/regra de negócio permanentemente no seu prompt. Use quando o usuário corrigir seu comportamento, ensinar uma regra nova, ou pedir para lembrar algo nas próximas conversas. A instrução é ADICIONADA ao prompt existente (não substitui). Exemplos: 'leads válidos = só os que têm deals', 'MRR considerar só transactions approved', 'ignorar leads com sales_stage=perdido'.",
        input_schema: {
          type: "object",
          properties: {
            instruction: { type: "string", description: "A regra/instrução a ser salva permanentemente. Seja claro e específico." },
            category: { type: "string", description: "Categoria da instrução", enum: ["regra_negocio", "definicao_metrica", "filtro_dados", "formato_resposta", "comportamento", "outro"] }
          },
          required: ["instruction", "category"]
        }
      }
      ,
      {
        name: "search_images",
        description: "Busca imagens no Serp para um slide do carrossel. Usa a Edge Function 'hybrid-image-search'",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string" },
            count: { type: ["integer","null"], description: "quantidade por slide (default 3)" },
            filters: { type: ["object","null"] }
          },
          required: ["query"]
        }
      },
      {
        name: "render_carousel",
        description: "Renderiza slides via Templated.io. Espera template_id e autofill_data mapeados para as layers do template.",
        input_schema: {
          type: "object",
          properties: {
            template_id: { type: "string" },
            autofill_data: { type: "object" },
            carousel_id: { type: ["string","null"], description: "Opcional: ID de content_carousels para atualizar com render_urls" },
            title: { type: ["string","null"], description: "Opcional: título para criar um draft caso carousel_id não seja fornecido" }
          },
          required: ["template_id","autofill_data"]
        }
      },
      {
        name: "save_draft",
        description: "Salva/atualiza um rascunho de carrossel em content_carousels",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            source_url: { type: ["string","null"] },
            template_id: { type: ["string","null"] },
            slides: { type: "array" },
            status: { type: ["string","null"], description: "draft | approved | rendered" }
          },
          required: ["title","slides"]
        }
      },
      {
        name: "list_templates",
        description: "Lista templates de carrossel disponíveis (content_templates). Retorna id, external_id (Templated.io), name, provider, preview_url, default_for_social.",
        input_schema: {
          type: "object",
          properties: {
            limit: { type: ["integer","null"], description: "Quantidade máxima (1-24). Default 6" }
          },
          required: []
        }
      },
      {
        name: "get_template",
        description: "Obtém detalhes de um template (content_templates) incluindo layer_map. Pode buscar por id (UUID) ou external_id (Templated.io).",
        input_schema: {
          type: "object",
          properties: {
            id: { type: ["string","null"], description: "UUID de content_templates" },
            external_id: { type: ["string","null"], description: "ID do template no Templated.io" }
          },
          required: []
        }
      },
      {
        name: "create_kanban_item",
        description: "Cria um card no Kanban (content_board_items). Requer column_id e title.",
        input_schema: {
          type: "object",
          properties: {
            column_id: { type: "string" },
            title: { type: "string" },
            description: { type: ["string","null"] },
            assignee: { type: ["string","null"] },
            priority: { type: ["string","null"] },
            due_date: { type: ["string","null"], description: "YYYY-MM-DD" }
          },
          required: ["column_id","title"]
        }
      },
      // ========== TOOL SAVE INSIGHTS (CS) ==========
      {
        name: "save_insights",
        description: "Salva insights de IA na tabela organizations.ai_insights. Use quando o usuário pedir para salvar/gravar a análise ou insights gerados.",
        input_schema: {
          type: "object",
          properties: {
            organization_id: { type: "string", description: "UUID da organização/cliente" },
            summary: { type: "string", description: "Resumo executivo do cliente" },
            attention_points: { type: "array", items: { type: "string" }, description: "Lista de pontos de atenção" },
            opportunities: { type: "array", items: { type: "string" }, description: "Lista de oportunidades identificadas" },
            recommendations: { type: "array", items: { type: "string" }, description: "Lista de recomendações/próximos passos" },
            health_score: { type: ["integer","null"], description: "Score de saúde do cliente (0-100)" },
            churn_risk: { type: ["string","null"], enum: ["low","medium","high"], description: "Nível de risco de churn" }
          },
          required: ["organization_id", "summary"]
        }
      },
      // ========== SALES COPILOT TOOLS ==========
      {
        name: "create_deal",
        description: "Cria uma nova oportunidade/deal no pipeline de vendas. Use quando o vendedor pedir para criar uma oportunidade para um lead.",
        input_schema: {
          type: "object",
          properties: {
            lead_id: { type: "string", description: "UUID do lead" },
            product_id: { type: ["string","null"], description: "UUID do produto (opcional)" },
            negotiated_price: { type: "number", description: "Valor negociado em reais" },
            original_price: { type: ["number","null"], description: "Valor original do produto" },
            discount_percent: { type: ["number","null"], description: "Percentual de desconto (0-100)" },
            status: { type: ["string","null"], enum: ["open","won","lost"], description: "Status do deal (default: open)" },
            pipeline_stage_id: { type: ["string","null"], description: "UUID do estágio no pipeline" },
            ai_win_probability: { type: ["number","null"], description: "Probabilidade de ganho calculada pela IA (0-100)" },
            notes: { type: ["string","null"], description: "Notas/observações sobre o deal" },
            expected_close_date: { type: ["string","null"], description: "Data prevista de fechamento (YYYY-MM-DD)" }
          },
          required: ["lead_id", "negotiated_price"]
        }
      },
      {
        name: "update_deal",
        description: "Atualiza um deal existente. Pode mover de estágio, mudar preço, status, etc.",
        input_schema: {
          type: "object",
          properties: {
            deal_id: { type: "string", description: "UUID do deal a atualizar" },
            negotiated_price: { type: ["number","null"], description: "Novo valor negociado" },
            discount_percent: { type: ["number","null"], description: "Novo percentual de desconto" },
            status: { type: ["string","null"], enum: ["open","won","lost"], description: "Novo status" },
            pipeline_stage_id: { type: ["string","null"], description: "Mover para este estágio" },
            lost_reason: { type: ["string","null"], description: "Motivo da perda (se status=lost)" },
            notes: { type: ["string","null"], description: "Novas notas" },
            ai_win_probability: { type: ["number","null"], description: "Nova probabilidade de ganho" },
            expected_close_date: { type: ["string","null"], description: "Nova data prevista" }
          },
          required: ["deal_id"]
        }
      },
      {
        name: "update_lead",
        description: "Atualiza dados de um lead. Pode mudar score, estágio, BANT, tags, etc.",
        input_schema: {
          type: "object",
          properties: {
            lead_id: { type: "string", description: "UUID do lead a atualizar" },
            sales_score: { type: ["number","null"], description: "Novo score de vendas (0-100)" },
            sales_stage: { type: ["string","null"], enum: ["captura","qualificacao","agendamento","negociacao","fechado","perdido"], description: "Novo estágio no funil" },
            bant_budget: { type: ["boolean","null"], description: "Tem orçamento?" },
            bant_authority: { type: ["boolean","null"], description: "É decisor?" },
            bant_need: { type: ["boolean","null"], description: "Tem necessidade?" },
            bant_timeline: { type: ["boolean","null"], description: "Tem urgência?" },
            tags: { type: ["array","null"], items: { type: "string" }, description: "Novas tags" },
            notes: { type: ["string","null"], description: "Novas notas/observações" }
          },
          required: ["lead_id"]
        }
      },
      {
        name: "search_leads_ranked",
        description: "Busca leads qualificados com ranking personalizado. Retorna leads ordenados por critérios de qualificação.",
        input_schema: {
          type: "object",
          properties: {
            limit: { type: ["integer","null"], description: "Quantidade máxima de leads (default: 10)" },
            min_score: { type: ["number","null"], description: "Score mínimo para filtrar" },
            stages: { type: ["array","null"], items: { type: "string" }, description: "Filtrar por estágios específicos" },
            has_recent_activity: { type: ["boolean","null"], description: "Apenas com atividade nos últimos 7 dias" },
            has_whatsapp: { type: ["boolean","null"], description: "Apenas com conversas WhatsApp" },
            order_by: { type: ["string","null"], enum: ["score_desc","recent_activity","created_desc","engagement"], description: "Critério de ordenação" }
          },
          required: []
        }
      },
      {
        name: "get_pipeline_summary",
        description: "Retorna resumo do pipeline de vendas com métricas por estágio, valor total, quantidade de deals, etc.",
        input_schema: {
          type: "object",
          properties: {
            sales_rep_id: { type: ["string","null"], description: "Filtrar por vendedor específico" },
            date_from: { type: ["string","null"], description: "Data inicial (YYYY-MM-DD)" },
            date_to: { type: ["string","null"], description: "Data final (YYYY-MM-DD)" }
          },
          required: []
        }
      },
      {
        name: "create_activity",
        description: "Cria uma atividade/tarefa relacionada a um lead (follow-up, ligação, reunião, etc.)",
        input_schema: {
          type: "object",
          properties: {
            lead_id: { type: "string", description: "UUID do lead" },
            type: { type: "string", enum: ["follow_up","call","meeting","email","task","note"], description: "Tipo da atividade" },
            title: { type: "string", description: "Título da atividade" },
            description: { type: ["string","null"], description: "Descrição detalhada" },
            scheduled_at: { type: ["string","null"], description: "Data/hora agendada (ISO)" },
            priority: { type: ["string","null"], enum: ["low","medium","high","urgent"], description: "Prioridade" }
          },
          required: ["lead_id", "type", "title"]
        }
      },
      {
        name: "bulk_analyze_leads",
        description: "Analisa múltiplos leads de uma vez e retorna recomendações. Use para encontrar oportunidades em lote.",
        input_schema: {
          type: "object",
          properties: {
            lead_ids: { type: ["array","null"], items: { type: "string" }, description: "Lista de UUIDs específicos (opcional)" },
            criteria: { type: "string", description: "Critério de análise: 'hot_leads', 'stale_deals', 'high_potential', 'need_followup'" },
            limit: { type: ["integer","null"], description: "Quantidade máxima (default: 10)" }
          },
          required: ["criteria"]
        }
      },
      {
        name: "create_leads_from_pain",
        description: "Cria leads na tabela leads a partir de registros da pain_registrations que ainda não têm lead_id. Use quando precisar criar oportunidades para leads do PAIN.",
        input_schema: {
          type: "object",
          properties: {
            pain_registration_ids: { type: "array", items: { type: "string" }, description: "Lista de UUIDs da pain_registrations para criar leads" },
            sales_stage: { type: ["string","null"], enum: ["captura","qualificacao","agendamento","negociacao"], description: "Estágio inicial (default: qualificacao)" }
          },
          required: ["pain_registration_ids"]
        }
      },
      {
        name: "create_deals_batch",
        description: "Cria múltiplos deals de uma vez a partir de uma lista de lead_ids. Use para criar oportunidades em lote.",
        input_schema: {
          type: "object",
          properties: {
            lead_ids: { type: "array", items: { type: "string" }, description: "Lista de UUIDs de leads" },
            product_id: { type: ["string","null"], description: "UUID do produto (opcional)" },
            negotiated_price: { type: "number", description: "Valor negociado para todos os deals" },
            pipeline_stage_id: { type: ["string","null"], description: "UUID do estágio no pipeline" },
            notes: { type: ["string","null"], description: "Notas para os deals" }
          },
          required: ["lead_ids", "negotiated_price"]
        }
      },
      // ========== TOOLS MCP - META ADS (Gestor de Tráfego) ==========
      {
        name: "mcp_get_campaigns",
        description: "Lista campanhas do Meta Ads. Retorna id, name, status, objective, daily_budget, lifetime_budget.",
        input_schema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "ID da conta (ex: act_3104134859737272)" },
            limit: { type: ["integer","null"], description: "Quantidade máxima (default 50)" },
            status: { type: ["string","null"], description: "Filtrar por status: ACTIVE, PAUSED, ARCHIVED" }
          },
          required: ["account_id"]
        }
      },
      {
        name: "mcp_get_campaign_details",
        description: "Detalhes de uma campanha específica incluindo configurações e métricas.",
        input_schema: {
          type: "object",
          properties: {
            campaign_id: { type: "string", description: "ID da campanha" }
          },
          required: ["campaign_id"]
        }
      },
      {
        name: "mcp_get_adsets",
        description: "Lista conjuntos de anúncios (ad sets) de uma campanha ou conta.",
        input_schema: {
          type: "object",
          properties: {
            account_id: { type: ["string","null"], description: "ID da conta" },
            campaign_id: { type: ["string","null"], description: "ID da campanha (opcional)" },
            limit: { type: ["integer","null"], description: "Quantidade máxima" }
          },
          required: []
        }
      },
      {
        name: "mcp_get_ads",
        description: "Lista anúncios de um ad set, campanha ou conta.",
        input_schema: {
          type: "object",
          properties: {
            account_id: { type: ["string","null"], description: "ID da conta" },
            adset_id: { type: ["string","null"], description: "ID do ad set" },
            campaign_id: { type: ["string","null"], description: "ID da campanha" },
            limit: { type: ["integer","null"], description: "Quantidade máxima" }
          },
          required: []
        }
      },
      {
        name: "mcp_get_insights",
        description: "Métricas de performance (spend, impressions, clicks, conversions, etc). Pode ser de conta, campanha, adset ou ad.",
        input_schema: {
          type: "object",
          properties: {
            object_id: { type: "string", description: "ID do objeto (conta, campanha, adset ou ad)" },
            date_preset: { type: ["string","null"], description: "Período: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month" },
            time_range: { type: ["object","null"], description: "Período customizado: {since: 'YYYY-MM-DD', until: 'YYYY-MM-DD'}" },
            level: { type: ["string","null"], description: "Nível de agregação: account, campaign, adset, ad" },
            fields: { type: ["array","null"], description: "Campos específicos a retornar" }
          },
          required: ["object_id"]
        }
      },
      {
        name: "mcp_get_ad_creatives",
        description: "Lista criativos dos anúncios com imagens, vídeos e textos.",
        input_schema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "ID da conta" },
            limit: { type: ["integer","null"], description: "Quantidade máxima" }
          },
          required: ["account_id"]
        }
      },
      {
        name: "mcp_search_interests",
        description: "Pesquisa interesses para segmentação de público.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Termo de busca (ex: 'marketing digital', 'fitness')" },
            limit: { type: ["integer","null"], description: "Quantidade máxima (default 25)" }
          },
          required: ["query"]
        }
      },
      {
        name: "mcp_estimate_audience_size",
        description: "Estima o tamanho de um público baseado em targeting.",
        input_schema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "ID da conta" },
            targeting_spec: { type: "object", description: "Especificação de targeting (geo, interests, age, gender, etc)" }
          },
          required: ["account_id", "targeting_spec"]
        }
      },
      {
        name: "mcp_create_campaign",
        description: "Cria uma nova campanha no Meta Ads.",
        input_schema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "ID da conta" },
            name: { type: "string", description: "Nome da campanha" },
            objective: { type: "string", description: "Objetivo: OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_TRAFFIC" },
            status: { type: ["string","null"], description: "Status inicial: ACTIVE ou PAUSED (default PAUSED)" },
            special_ad_categories: { type: ["array","null"], description: "Categorias especiais se aplicável" }
          },
          required: ["account_id", "name", "objective"]
        }
      },
      {
        name: "mcp_update_campaign",
        description: "Atualiza uma campanha existente (pausar, ativar, renomear, etc).",
        input_schema: {
          type: "object",
          properties: {
            campaign_id: { type: "string", description: "ID da campanha" },
            name: { type: ["string","null"], description: "Novo nome" },
            status: { type: ["string","null"], description: "Novo status: ACTIVE ou PAUSED" },
            daily_budget: { type: ["integer","null"], description: "Novo budget diário em centavos" }
          },
          required: ["campaign_id"]
        }
      },
      {
        name: "mcp_create_adset",
        description: "Cria um novo conjunto de anúncios (ad set).",
        input_schema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "ID da conta" },
            campaign_id: { type: "string", description: "ID da campanha" },
            name: { type: "string", description: "Nome do ad set" },
            daily_budget: { type: ["integer","null"], description: "Budget diário em centavos" },
            lifetime_budget: { type: ["integer","null"], description: "Budget total em centavos" },
            targeting: { type: "object", description: "Configuração de targeting" },
            optimization_goal: { type: "string", description: "Meta de otimização" },
            billing_event: { type: "string", description: "Evento de cobrança: IMPRESSIONS, LINK_CLICKS, etc" },
            status: { type: ["string","null"], description: "Status: ACTIVE ou PAUSED" }
          },
          required: ["account_id", "campaign_id", "name", "targeting", "optimization_goal", "billing_event"]
        }
      },
      {
        name: "mcp_update_adset",
        description: "Atualiza um ad set existente.",
        input_schema: {
          type: "object",
          properties: {
            adset_id: { type: "string", description: "ID do ad set" },
            name: { type: ["string","null"], description: "Novo nome" },
            status: { type: ["string","null"], description: "Novo status" },
            daily_budget: { type: ["integer","null"], description: "Novo budget diário" },
            targeting: { type: ["object","null"], description: "Nova configuração de targeting" }
          },
          required: ["adset_id"]
        }
      },
      {
        name: "mcp_search_geo_locations",
        description: "Pesquisa localizações geográficas para targeting.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Termo de busca (ex: 'São Paulo', 'Brasil')" },
            location_types: { type: ["array","null"], description: "Tipos: country, region, city, zip" },
            limit: { type: ["integer","null"], description: "Quantidade máxima" }
          },
          required: ["query"]
        }
      }
    ];

    // ========== MCP SERVER HELPER ==========
    const MCP_SERVER_URL = 'https://mcp-production-0440.up.railway.app/mcp';
    const MCP_API_KEY = '164co3CnbWaaL68dtUORHHi8Yoa9d09ahGGoiAHG1wo';
    const META_ACCESS_TOKEN = Deno.env.get('META_ADS_ACCESS_TOKEN') || 'EAAOv3l2dbOYBQS0kujee7GTEYAFDTDpJrf0n4IgWbIud6VTZBdqn4hoDlpgDYtsOthBtUDj9AtqcZCUjjjA3ZB7dWdozqigR6VJNJJWwai7wlaudU5iavsZBkZBFzU4lP3WTjwp3cZCMJGiAXUIg3ENL79ZAiMwOAf0VIuZC0jmiEhMl1DESqT1b0xsuXwZDZD';
    const META_ACCOUNT_ID = 'act_3104134859737272';

    async function callMcpServer(toolName: string, args: any): Promise<any> {
      // Mapeia nome da tool interna para nome da tool no MCP
      const mcpToolName = toolName.replace('mcp_', '');
      
      // Injeta access_token e account_id padrão se não fornecidos
      const enrichedArgs = { ...args };
      if (!enrichedArgs.access_token) {
        enrichedArgs.access_token = META_ACCESS_TOKEN;
      }
      if (!enrichedArgs.account_id && mcpToolName !== 'search_interests' && mcpToolName !== 'search_geo_locations') {
        enrichedArgs.account_id = META_ACCOUNT_ID;
      }

      console.log(`[MCP] Calling ${mcpToolName} with args:`, JSON.stringify(enrichedArgs).slice(0, 500));

      try {
        const resp = await fetch(MCP_SERVER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'X-API-KEY': MCP_API_KEY
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            id: Date.now(),
            params: { 
              name: mcpToolName, 
              arguments: enrichedArgs 
            }
          })
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          console.error(`[MCP] HTTP Error ${resp.status}:`, errText);
          return { error: `MCP Server error: ${resp.status}`, details: errText };
        }

        const json = await resp.json();
        console.log(`[MCP] Response for ${mcpToolName}:`, JSON.stringify(json).slice(0, 1000));

        if (json.error) {
          return { error: json.error.message || 'MCP error', code: json.error.code };
        }

        // O resultado vem em json.result.content[0].text (formato MCP)
        if (json.result?.content?.[0]?.text) {
          try {
            return JSON.parse(json.result.content[0].text);
          } catch {
            return { data: json.result.content[0].text };
          }
        }

        return json.result || json;
      } catch (e) {
        console.error(`[MCP] Exception calling ${mcpToolName}:`, (e as any).message);
        return { error: `Exception: ${(e as any).message}` };
      }
    }
    // Heurística simples para evitar ambiguidade de created_at quando há alias
    function disambiguateCreatedAt(sql: string): string {
      let out = sql;
      if (/\bfrom\s+leads\s+l\b/i.test(out)) {
        out = out.replace(/DATE\(\s*created_at/gi, 'DATE(l.created_at');
        out = out.replace(/DATE_TRUNC\(([^)]*?),\s*created_at/gi, 'DATE_TRUNC($1, l.created_at');
        out = out.replace(/\bGROUP BY\s+created_at\b/gi, 'GROUP BY l.created_at');
      }
      if (/\bfrom\s+transactions\s+t\b/i.test(out)) {
        out = out.replace(/DATE\(\s*created_at/gi, 'DATE(t.created_at');
        out = out.replace(/\bGROUP BY\s+created_at\b/gi, 'GROUP BY t.created_at');
      }
      return out;
    }

    function pruneConversation(msgs: any[], maxMessages = 12, maxChars = 16000) {
      // Mantém apenas as últimas N mensagens e limita tamanho total aproximado.
      // Importante: PRESERVA blocos estruturados (tool_use/tool_result) para Anthropic.
      const tail = msgs.slice(-maxMessages);
      let total = 0;
      const pruned = [] as any[];
      for (let i = tail.length - 1; i >= 0; i--) {
        const m = tail[i];
        // 1) Se o conteúdo já é um array de blocks e contém tool_use/tool_result, preserva como está
        if (Array.isArray(m.content)) {
          const hasStructured = m.content.some((b: any) => b && (b.type === 'tool_use' || b.type === 'tool_result'));
          if (hasStructured) {
            pruned.unshift({ role: m.role, content: m.content });
            // não soma em maxChars para não truncar pares críticos
            continue;
          }
        }

        // 2) Caso contrário, compacta para texto
        let contentStr = '';
        if (typeof m.content === 'string') {
          contentStr = m.content;
        } else if (Array.isArray(m.content)) {
          contentStr = m.content
            .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
            .map((b: any) => String(b.text))
            .join('');
        } else {
          contentStr = String(m.content || '');
        }
        if (m.role === 'assistant' && contentStr.length > 1200) {
          contentStr = '… ' + contentStr.slice(-800);
        }
        total += contentStr.length;
        if (total > maxChars) break;
        pruned.unshift({ role: m.role, content: contentStr });
      }
      return pruned.length ? pruned : tail;
    }

    function extractAssistantText(step: any): string {
      try {
        if (!step?.content) return '';
        const blocks = Array.isArray(step.content) ? step.content : [];
        return blocks
          .filter((b: any) => b && b.type === 'text')
          .map((b: any) => String(b.text || ''))
          .join('');
      } catch (_e) {
        return step?.content?.[0]?.text || '';
      }
    }

    // Normaliza texto para comparações (evita duplicação por espaços/caso)
    function normText(s: string): string {
      return String(s || '')
        .normalize('NFKC')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
    }

    // Remove duplicatas consecutivas por (role + conteúdo normalizado)
    function dedupConsecutive(list: Array<{ role: 'user'|'assistant', content: any }>) {
      const out: typeof list = [] as any;
      for (const m of list) {
        const prev = out.length ? out[out.length - 1] : null;
        const currIsText = typeof m.content === 'string';
        const prevIsText = prev && typeof prev.content === 'string';
        if (
          prev &&
          prev.role === m.role &&
          currIsText && prevIsText &&
          normText(prev.content) === normText(m.content)
        ) {
          continue;
        }
        out.push(m);
      }
      return out;
    }

    function isApprovalIntent(text: string): boolean {
      const t = (text || '').toLowerCase();
      // inclui sinônimos comuns no BR
      return /(\baprovo\b|\baprovado\b|pode\s+renderizar|\bsegue\b|pode\s+seguir|\bfechou\b|\bfeshow\b|manda\s+ver|manda\s+bala|desce\s+o\s+bambu|mete\s+bronca|pode\s+fazer|\bprossiga\b|pode\s+prosseguir|segue\s+o\s+jogo|toca\s+o\s+barco)/.test(t);
    }

    async function fetchLastOutline(sessionId: string): Promise<string | null> {
      try {
        const { data } = await supabase
          .from('chat_messages')
          .select('role, content, created_at')
          .eq('session_id', sessionId)
          .in('role', ['assistant'])
          .order('created_at', { ascending: false })
          .limit(12);
        const candidates = (data || []).map((d: any) => String(d.content || ''));
        // heurísticas simples para achar roteiro
        const match = candidates.find((c) => /Slide\s*\d|Roteiro|Carrossel|SLIDE\s*\d/i.test(c));
        if (!match) return null;
        // truncar para evitar excesso de tokens
        return match.slice(0, 4000);
      } catch {
        return null;
      }
    }

    function buildApprovalDirective(toolsConfig: any, titleHint?: string, outline?: string | null): string {
      const countDefault = toolsConfig?.serp?.count_default || 2;
      const titleFragment = titleHint ? `, title: \"${titleHint}\"` : '';
      const outlineBlock = outline ? `\n\nCONTEUDO_APROVADO (referência do roteiro):\n${outline}\n` : '';
      return `APROVACAO_CONFIRMADA -> Siga estritamente (LIMITE MÁXIMO: 8 slides):
PREPARO DO TEMPLATE
• Se AINDA NÃO houver um template escolhido nesta conversa: chame a tool list_templates com { limit: 6 }, mostre as opções (nome + preview_url) e aguarde o usuário escolher informando o external_id.
• Depois de escolhido, chame get_template com { external_id } para obter o layer_map do template.

MONTAGEM DO CONTEUDO
• Adapte o roteiro aprovado ao layer_map do template (ex.: slide1_title, slide1_subtitle, slide1_image). Respeite limites de caracteres quando informados no layer_map.
• Para cada slide que exija imagem: chame search_images com { count: ${countDefault} } (se o usuário não enviou arte própria) e escolha a PRIMEIRA opção.

RENDER
• Renderize SOMENTE os primeiros 8 slides com tool render_carousel passando { template_id: TEMPLATE_ESCOLHIDO, autofill_data${titleFragment} }.

RESPOSTA AO USUÁRIO
• Liste os links finais (um por slide) e o link do editor, caso disponível.
• Informe o template utilizado e salve no histórico.
Não peça confirmação adicional.${outlineBlock}`;
    }

    // Chamada síncrona ao Claude (para tool loops) - COM PROMPT CACHING
    async function callClaude(msgs, systemPrompt: string, useTools = true) {
      const prunedMsgs = pruneConversation(msgs);
      console.log("Chamando Claude com mensagens:", JSON.stringify(prunedMsgs).slice(0, 500)); // Log: Antes de chamar Claude

      // Prompt Caching: estruturar system como array com cache_control
      const systemBlocks = [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" } // Cache por ~5min
        }
      ];

      const payload: any = {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 3000,
        system: systemBlocks, // Array para prompt caching
        messages: prunedMsgs
      };
      if (useTools) {
        payload.tools = tools;
      }
      let attempt = 0;
      while (attempt < 3) {
        attempt++;
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "prompt-caching-2024-07-31" // Habilita prompt caching
          },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const jsonResp = await resp.json();
          console.log("Resposta do Claude:", JSON.stringify(jsonResp).slice(0, 500));
          return jsonResp;
        }
        const txt = await resp.text().catch(() => '');
        console.error("Erro na API do Claude:", resp.status, txt);
        if (resp.status === 429) {
          const retryAfter = resp.headers.get('retry-after');
          let waitMs = retryAfter ? Math.max(0, Math.floor(parseFloat(retryAfter) * 1000)) : Math.floor(1000 * Math.pow(2, attempt));
          const jitter = Math.floor(waitMs * (Math.random() * 0.4 - 0.2));
          waitMs = Math.min(15000, Math.max(1000, waitMs + jitter));
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        throw new Error(`Claude API error: ${resp.status} ${txt}`);
      }
      throw new Error('Claude API error: 429 after retries');
    }

    // Função para sanitizar strings e remover caracteres inválidos (surrogates)
    function sanitizeForJson(obj: any): any {
      if (typeof obj === 'string') {
        // Remove caracteres surrogate inválidos que quebram JSON
        return obj.replace(/[\uD800-\uDFFF]/g, '').replace(/[\x00-\x1F\x7F]/g, ' ');
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitizeForJson);
      }
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const key of Object.keys(obj)) {
          result[key] = sanitizeForJson(obj[key]);
        }
        return result;
      }
      return obj;
    }

    // Streaming REAL do Claude - processa eventos SSE e chama callback para cada delta de texto
    async function callClaudeStreaming(
      msgs: any[], 
      systemPrompt: string, 
      onTextDelta: (text: string) => void,
      onToolUse: (toolUses: any[]) => void
    ): Promise<{ fullText: string; stopReason: string; toolUses: any[] }> {
      const prunedMsgs = sanitizeForJson(pruneConversation(msgs));
      const cleanSystemPrompt = sanitizeForJson(systemPrompt);
      console.log("[streaming-real] Chamando Claude com streaming...");

      // Prompt Caching: estruturar system como array com cache_control
      const systemBlocks = [
        {
          type: "text",
          text: cleanSystemPrompt,
          cache_control: { type: "ephemeral" } // Cache por ~5min
        }
      ];

      const payload = {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        system: systemBlocks, // Array para prompt caching
        messages: prunedMsgs,
        tools,
        stream: true // STREAMING REAL
      };

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31" // Habilita prompt caching
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok || !resp.body) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`Claude streaming error: ${resp.status} ${txt}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let stopReason = 'end_turn';
      const toolUses: any[] = [];
      let currentToolUse: any = null;
      let toolInputJson = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            
            // Processar diferentes tipos de eventos do Claude streaming
            if (event.type === 'content_block_start') {
              if (event.content_block?.type === 'tool_use') {
                currentToolUse = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: {}
                };
                toolInputJson = '';
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta?.type === 'text_delta' && event.delta.text) {
                fullText += event.delta.text;
                onTextDelta(event.delta.text); // Envia delta em tempo real
              } else if (event.delta?.type === 'input_json_delta' && currentToolUse) {
                toolInputJson += event.delta.partial_json || '';
              }
            } else if (event.type === 'content_block_stop') {
              if (currentToolUse) {
                try {
                  currentToolUse.input = JSON.parse(toolInputJson || '{}');
                } catch {
                  currentToolUse.input = {};
                }
                toolUses.push(currentToolUse);
                currentToolUse = null;
                toolInputJson = '';
              }
            } else if (event.type === 'message_delta') {
              if (event.delta?.stop_reason) {
                stopReason = event.delta.stop_reason;
              }
            }
          } catch (e) {
            // Ignorar eventos malformados
          }
        }
      }

      console.log("[streaming-real] Finalizado. Texto:", fullText.length, "chars, Tools:", toolUses.length, "Stop:", stopReason);
      
      if (toolUses.length > 0) {
        onToolUse(toolUses);
      }

      return { fullText, stopReason, toolUses };
    }
    async function execSupabase(sql) {
      console.log("Executando SQL com Supabase SDK:", sql); // Log: SQL original
      // Evitar ambiguidade de created_at quando aliases são usados
      sql = disambiguateCreatedAt(sql);
      const s = (sql || "").trim().toLowerCase();
      if (s.match(/\b(insert|update|delete|create|drop|alter|truncate)\b/)) {
        console.error("SQL proibido (contém DML/DDL):", sql); // Log: Erro SQL perigoso
        throw new Error("Apenas queries de leitura permitidas");
      }
      if (!s.includes("select")) {
        console.error("SQL inválido (sem SELECT):", sql); // Log: Sem SELECT
        throw new Error("Apenas SELECT permitido");
      }
      let attempts = 0;
      while(attempts < 3){
        attempts++;
        const { data, error } = await supabase.rpc('run_sql', {
          sql
        }); // Use rpc se você criou a function run_sql; senão use .from for simple queries
        if (error) {
          console.error("Erro no Supabase (tentativa " + attempts + "):", error);
          // Fallback específico: coluna inexistente (42703). Ex.: remover 'budget' em SELECTs de projects.
          const msg = String((error as any)?.message || '');
          const code = (error as any)?.code || '';
          if (attempts === 1 && (code === '42703' || /does not exist/i.test(msg))) {
            if (/\bfrom\s+projects\b/i.test(sql) && /\bbudget\b/i.test(sql)) {
              const fixed = sql
                .replace(/\s*,\s*budget\b/gi, '')
                .replace(/\bbudget\s*,\s*/gi, '');
              if (fixed !== sql) {
                console.warn('[execSupabase] Removendo coluna inexistente "budget" de SELECT em projects');
                sql = fixed;
                continue; // reexecuta imediatamente com SQL corrigido
              }
            }
          }
          if (error.code !== "PGRST002") {
            throw new Error(`Supabase error: ${error.message}`);
          }
          await new Promise((resolve)=>setTimeout(resolve, 1000 * attempts)); // Exponential backoff
        } else {
          console.log("Resultado do Supabase:", JSON.stringify(data)); // Log: Resultado
          return data;
        }
      }
      throw new Error("Falha ao executar query após retries");
    }
    // Contexto por sessão/agente
    const agentSlug = (agent && typeof agent === 'string' ? agent : 'sales');
    let resolvedSessionId = session_id || null;
    let systemPromptToUse = FALLBACK_SYSTEM_PROMPT;

    // 1) Descobrir config do agente (usar admin para bypass RLS)
    const { data: cfgRow, error: cfgErr } = await supabaseAdmin
      .from('chat_configs')
      .select('id, system_prompt, provider, model, tools')
      .eq('slug', agentSlug)
      .maybeSingle();
    if (cfgErr) {
      console.error('Erro ao carregar chat_configs:', cfgErr);
    }
    const configId = cfgRow?.id || null;
    if (cfgRow?.system_prompt) systemPromptToUse = cfgRow.system_prompt;
    const provider = (cfgRow?.provider || 'anthropic') as string;
    const modelFromConfig = (cfgRow?.model || 'gpt-5') as string;
    const toolsConfig: any = cfgRow?.tools || {};
    console.log('[chat-manager] Prompt source:', cfgRow?.system_prompt ? 'chat_configs.system_prompt' : 'FALLBACK_SYSTEM_PROMPT');
    console.log('[chat-manager] Agent:', agentSlug, 'Session:', resolvedSessionId, 'ConfigId:', configId);
    console.log('[chat-manager] System prompt in use ->\n', systemPromptToUse);

    // Injetar data/hora de Brasília para TODOS os agentes que não têm
    const _now = new Date();
    const _br = new Date(_now.getTime() - 3 * 60 * 60 * 1000);
    const _brDateStr = _br.toISOString().split('T')[0];
    const _brTimeStr = _br.toISOString().split('T')[1].slice(0, 5);
    const _dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const _brDayName = _dayNames[_br.getUTCDay()];

    // Agente Sales Copilot: usar prompt específico mais assertivo
    if (agentSlug === 'sales-copilot') {
      systemPromptToUse = SALES_COPILOT_PROMPT;
      systemPromptToUse += `\n\nDATA DE HOJE: ${_brDateStr} (${_brDayName})\nHORA: ${_brTimeStr} (Brasília, UTC-3)`;
      console.log('[chat-manager] Using SALES_COPILOT_PROMPT for agent sales-copilot');

      // Adicionar contexto do lead se fornecido
      if (context && typeof context === 'object') {
        const leadContext = context as any;
        if (leadContext.lead_id) {
          const leadInfoParts = [];
          leadInfoParts.push(`\n\n===== CONTEXTO DO LEAD ATUAL =====`);
          leadInfoParts.push(`Lead ID: ${leadContext.lead_id}`);
          if (leadContext.lead_name) leadInfoParts.push(`Nome: ${leadContext.lead_name}`);
          if (leadContext.lead_phone) leadInfoParts.push(`Telefone: ${leadContext.lead_phone}`);
          if (leadContext.lead_email) leadInfoParts.push(`Email: ${leadContext.lead_email}`);
          if (leadContext.sales_score !== undefined) leadInfoParts.push(`Sales Score: ${leadContext.sales_score}`);
          if (leadContext.sales_stage) leadInfoParts.push(`Estágio: ${leadContext.sales_stage}`);
          if (leadContext.bant) {
            const bant = leadContext.bant;
            leadInfoParts.push(`BANT: Budget=${bant.budget ?? '?'}, Authority=${bant.authority ?? '?'}, Need=${bant.need ?? '?'}, Timeline=${bant.timeline ?? '?'}`);
          }
          if (leadContext.utm_source || leadContext.utm_campaign) {
            leadInfoParts.push(`Origem: ${leadContext.utm_source || 'N/A'} / ${leadContext.utm_campaign || 'N/A'}`);
          }
          leadInfoParts.push(`\nPara buscar dados deste lead use: SELECT * FROM leads WHERE id = '${leadContext.lead_id}'`);
          leadInfoParts.push(`Para WhatsApp: SELECT * FROM whatsapp_messages WHERE lead_id = '${leadContext.lead_id}' ORDER BY created_at DESC LIMIT 30`);
          leadInfoParts.push(`Para deals: SELECT * FROM deals WHERE lead_id = '${leadContext.lead_id}'`);
          leadInfoParts.push(`========================================\n`);

          systemPromptToUse += leadInfoParts.join('\n');
          console.log('[chat-manager] Added lead context for lead:', leadContext.lead_name || leadContext.lead_id);
        }
      }
    }

    // Regras específicas do agente Social: Caminho A (seleção de template antes de gerar/renderer)
    if (agentSlug === 'social') {
      systemPromptToUse += `\n\nPOLÍTICA DE CARROSSEL (Caminho A)\n• Ao detectar intenção de criar carrossel (ex.: "carrossel", "slides", "carousel"), SEMPRE liste templates antes (tool: list_templates { limit: 6 }).\n• Mostre os templates com nome e preview_url (quando houver) e solicite que o usuário escolha pelo external_id.\n• Após a escolha, obtenha o layer_map do template (tool: get_template).\n• Gere/adapte o roteiro já mapeado aos nomes de camadas do template e respeite limites de caracteres quando informados.\n• Só renderize (tool: render_carousel) com template_id definido (use o external_id do template escolhido).\n• Se o usuário tentar renderizar sem template escolhido, peça que ele selecione um template executando list_templates novamente.\n`;
    }

    // Agente Event Manager: Gestora de Eventos
    if (agentSlug === 'event-manager') {
      systemPromptToUse = EVENT_MANAGER_PROMPT;
      console.log('[chat-manager] Using EVENT_MANAGER_PROMPT for agent event-manager');

      // Injetar contexto do evento se fornecido
      if (context && typeof context === 'object') {
        const eventContext = context as any;
        if (eventContext.event_id) {
          const eventParts: string[] = [];
          eventParts.push(`\n\n===== CONTEXTO DO EVENTO ATUAL =====`);
          eventParts.push(`Event ID: ${eventContext.event_id}`);
          if (eventContext.event_name) eventParts.push(`Nome: ${eventContext.event_name}`);
          if (eventContext.event_date) eventParts.push(`Data: ${eventContext.event_date}`);
          if (eventContext.event_location) eventParts.push(`Local: ${eventContext.event_location}`);
          eventParts.push(`\nAo criar tarefas com create_task, SEMPRE inclua event_id: '${eventContext.event_id}'`);
          eventParts.push(`\nQueries prontas para este evento:`);
          eventParts.push(`- Custos: SELECT ec.description, ec.supplier, ec.total_amount, ec.status, fc.name as categoria FROM cs_event_costs ec LEFT JOIN financial_categories fc ON ec.category_id = fc.id WHERE ec.event_id = '${eventContext.event_id}'`);
          eventParts.push(`- Tarefas: SELECT * FROM company_activities WHERE event_id = '${eventContext.event_id}' ORDER BY completed ASC, date ASC`);
          eventParts.push(`- RSVPs: SELECT rsvp_status, COUNT(*) as total FROM cs_event_rsvps WHERE event_id = '${eventContext.event_id}' GROUP BY rsvp_status`);
          eventParts.push(`- Pagamentos: SELECT ecp.amount, ecp.due_date, ecp.status, ec.description, ec.supplier FROM cs_event_cost_payments ecp JOIN cs_event_costs ec ON ecp.event_cost_id = ec.id WHERE ec.event_id = '${eventContext.event_id}'`);
          eventParts.push(`========================================\n`);

          systemPromptToUse += eventParts.join('\n');
          console.log('[chat-manager] Added event context for event:', eventContext.event_name || eventContext.event_id);
        }
      }
    }

    // Agente HR Recruiter: Recrutadora IA
    if (agentSlug === 'hr-recruiter') {
      systemPromptToUse = HR_RECRUITER_PROMPT;
      console.log('[chat-manager] Using HR_RECRUITER_PROMPT for agent hr-recruiter');
    }

    // Agente CEO: usa prompt do banco (chat_configs.system_prompt) — sem override hardcoded
    if (agentSlug === 'ceo') {
      // O prompt já foi carregado do chat_configs na linha acima (cfgRow.system_prompt)
      // Se não existir no banco, usar fallback genérico
      if (!cfgRow?.system_prompt) {
        systemPromptToUse = FALLBACK_SYSTEM_PROMPT + '\n\nVocê é o CEO Assistant com visão 360° da empresa. Use information_schema para descobrir tabelas e colunas antes de consultar dados.';
      }
      // Injetar data/hora de Brasília (UTC-3) — variáveis calculadas acima
      systemPromptToUse += `\n\n====== DATA/HORA ATUAL ======\nHOJE: ${_brDateStr} (${_brDayName})\nHORA: ${_brTimeStr} (Brasília, UTC-3)\nUse estas referências para "hoje", "ontem", "esta semana", "este mês", etc.`;
      console.log('[chat-manager] Using DB prompt for agent ceo (schema self-discovery enabled)');
      console.log('[chat-manager] CEO date context:', _brDateStr, _brTimeStr, _brDayName);
    }

    // Garantir que TODOS os agentes tenham data/hora (caso não tenha sido injetado acima)
    if (!systemPromptToUse.includes('DATA DE HOJE') && !systemPromptToUse.includes('DATA/HORA ATUAL')) {
      systemPromptToUse += `\n\nDATA DE HOJE: ${_brDateStr} (${_brDayName}), ${_brTimeStr} (Brasília, UTC-3)`;
    }

    // 2) Validar/criar sessão (garante que toda sessão usada seja gravada)
    if (configId) {
      if (!resolvedSessionId) {
        // Caso 1: Nenhum session_id fornecido → criar nova sessão
        const { data: newSess, error: newSessErr } = await supabase
          .from('chat_sessions')
          .insert({ config_id: configId, title: 'Nova conversa' })
          .select('id')
          .single();
        if (!newSessErr && newSess?.id) {
          resolvedSessionId = newSess.id;
        } else if (newSessErr) {
          console.warn('Não foi possível criar sessão automaticamente:', newSessErr);
        }
      } else {
        // Caso 2: session_id fornecido → garantir que existe no banco (upsert idempotente)
        const { data: existingSess } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('id', resolvedSessionId)
          .maybeSingle();
        
        if (!existingSess) {
          // Sessão não existe → criar com o ID fornecido
          const { error: insertErr } = await supabase
            .from('chat_sessions')
            .insert({ id: resolvedSessionId, config_id: configId, title: 'Nova conversa' });
          if (insertErr) {
            console.warn('[chat-manager] Falha ao criar sessão fornecida pelo cliente:', insertErr);
          } else {
            console.log('[chat-manager] Sessão criada:', resolvedSessionId);
          }
        }
      }
    }

    // 3) Carregar histórico recente
    const conversation: any[] = [];

    // 3.1) Se o frontend enviou conversation_history (preferência para sales-copilot)
    if (Array.isArray(conversation_history) && conversation_history.length > 0) {
      console.log('[chat-manager] Using frontend conversation_history:', conversation_history.length, 'messages');
      for (const m of conversation_history) {
        if (m && m.role && m.content) {
          const r = (m.role === 'assistant' ? 'assistant' : 'user') as 'user'|'assistant';
          const content = String(m.content || '').trim();
          if (content) {
            conversation.push({ role: r, content });
          }
        }
      }
    }
    // 3.2) Senão, carregar do banco (comportamento original)
    else if (resolvedSessionId) {
      const { data: hist, error: histErr } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', resolvedSessionId)
        .in('role', ['user','assistant'])
        .order('created_at', { ascending: true })
        .limit(50);
      if (!histErr && Array.isArray(hist)) {
        for (const m of hist) {
          const r = (m.role === 'assistant' ? 'assistant' : 'user') as 'user'|'assistant';
          let content = String(m.content ?? '');

          // Filtrar tool rounds (JSON arrays com tool_use/tool_result)
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              // Se for array de blocks, extrair só texto
              const textBlocks = parsed.filter(b => b && b.type === 'text');
              if (textBlocks.length === 0) {
                continue; // Pula mensagens que são só tool_use/tool_result
              }
              content = textBlocks.map(b => b.text).join('');
            }
          } catch {
            // Não é JSON, usa como está
          }

          // Pula mensagens vazias ou "continue"
          if (!content.trim() || content.trim().toLowerCase() === 'continue') {
            continue;
          }

          // Evita duplicar mensagens consecutivas idênticas (por role e conteúdo normalizado)
          if (
            conversation.length &&
            conversation[conversation.length - 1].role === r &&
            normText(conversation[conversation.length - 1].content) === normText(content)
          ) {
            continue;
          }

          conversation.push({ role: r, content });
        }
      } else if (histErr) {
        console.warn('Falha ao carregar histórico da sessão:', histErr);
      }
    }

    // 4) Compatibilidade: se a mensagem atual não estiver no fim do histórico, apende-a
    if (message) {
      const last = conversation.length ? conversation[conversation.length - 1] : null;
      if (!last || normText(last.content) !== normText(message)) {
        conversation.push({ role: 'user', content: message });
      }
    }

    console.log('[chat-manager] Final conversation length:', conversation.length);

    // 4.1) Se o usuário sinalizou aprovação, reescreva a última mensagem do usuário com uma diretiva explícita de execução de ferramentas
    if (conversation.length && isApprovalIntent(conversation[conversation.length - 1].content)) {
      const titleMatch = message.match(/t[ií]tulo\s*:\s*([^\n]+)/i);
      const titleHint = titleMatch ? titleMatch[1].trim() : undefined;
      const lastOutline = resolvedSessionId ? await fetchLastOutline(resolvedSessionId) : null;
      conversation[conversation.length - 1] = {
        role: 'user',
        content: buildApprovalDirective(toolsConfig, titleHint, lastOutline)
      };
    }

    // 4.2) Persistência desativada para evitar duplicidade de mensagens do usuário (frontend persiste)
    // Intencionalmente não persistimos a mensagem do usuário aqui.

    // 4.3) Deduplicar histórico final antes de chamar o LLM
    const conversationClean = dedupConsecutive(conversation);
    // 4.4) Working set usado nas iterações (inclui continues e tool rounds desta requisição)
    const workingConversation: any[] = [...conversationClean];

    if (provider === 'openai') {
      // ==== OpenAI Responses + MCP ====
      const OPENAI_API_KEY = (Deno as any).env?.get?.('OPENAI_API_KEY') || '';
      const serverUrl = toolsConfig?.mcp?.server_url || '';
      const serverLabel = toolsConfig?.mcp?.server_label || 'mcp';
      const allowedTools = toolsConfig?.mcp?.allowed_tools || [];
      const requireApproval = toolsConfig?.mcp?.require_approval || 'never';
      const mcpApiKey = toolsConfig?.mcp?.headers?.['X-API-KEY'] || '';
      const responsesOptions = toolsConfig?.responses_options || {};

      // Buscar previous_response_id salvo na sessão (para encadear conversa na Responses API)
      let previousResponseId: string | null = null;
      if (resolvedSessionId) {
        const { data: sessRow } = await supabase
          .from('chat_sessions')
          .select('last_response_id')
          .eq('id', resolvedSessionId)
          .maybeSingle();
        previousResponseId = (sessRow?.last_response_id as string) || null;
      }

      const continuing = !!previousResponseId;
      const inputBlocks = continuing
        ? [
            { role: 'user', content: [{ type: 'input_text', text: String(message || '') }] },
          ]
        : [
            { role: 'developer', content: [{ type: 'input_text', text: String(systemPromptToUse) }] },
            ...conversationClean.map((m) => ({
              role: m.role,
              content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: String(m.content || '') }]
            }))
          ];

      const body: any = {
        model: modelFromConfig || 'gpt-5',
        input: inputBlocks,
        tools: [{
          type: 'mcp',
          server_label: serverLabel,
          server_url: serverUrl,
          authorization: mcpApiKey,
          allowed_tools: allowedTools,
          require_approval: requireApproval,
        }],
        text: responsesOptions.text || { format: { type: 'text' }, verbosity: 'medium' },
        reasoning: responsesOptions.reasoning || { effort: 'medium', summary: 'auto' },
        include: responsesOptions.include || ["reasoning.encrypted_content","web_search_call.action.sources"],
        store: responsesOptions.store ?? true,
        max_output_tokens: responsesOptions.max_tokens || 8000,
      };
      if (continuing) body.previous_response_id = previousResponseId;

      console.log('[chat-manager][openai] Request body model:', body.model, 'tools:', allowedTools?.length || 0, 'stream:', wantStream);
      console.log('[chat-manager][openai] MCP config - serverUrl:', serverUrl, 'serverLabel:', serverLabel, 'apiKey:', mcpApiKey ? 'SET' : 'MISSING');
      console.log('[chat-manager][openai] Request body (preview):', JSON.stringify(body).slice(0, 1500));
      if (wantStream) body.stream = true;
      const resp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          ...(wantStream ? { 'Accept': 'text/event-stream' } : {}),
        },
        body: JSON.stringify(body),
      });
      if (wantStream) {
        console.log('[chat-manager][openai][stream] Response status:', resp.status, 'ok:', resp.ok, 'has body:', !!resp.body);
        if (!resp.ok || !resp.body) {
          const errTxt = await resp.text().catch(()=>'');
          console.error('[chat-manager][openai][stream] Upstream error:', resp.status, errTxt);
          return new Response(JSON.stringify({ error: 'stream_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        console.log('[chat-manager][openai][stream] Intercepting SSE stream to log events');
        // Intercept stream to log events before piping to client
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            let buffer = '';
            let eventCount = 0;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  console.log('[chat-manager][openai][stream] Stream ended. Total events:', eventCount);
                  controller.close();
                  break;
                }
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                const events = buffer.split('\n\n');
                buffer = events.pop() || '';
                for (const ev of events) {
                  if (ev.trim()) {
                    eventCount++;
                    if (eventCount <= 20) {
                      console.log('[chat-manager][openai][stream] Event', eventCount, ':', ev.slice(0, 400));
                    }
                  }
                }
                controller.enqueue(encoder.encode(chunk));
              }
            } catch (e) {
              console.error('[chat-manager][openai][stream] Stream error:', e);
              controller.error(e);
            }
          }
        });
        const headers = new Headers(corsHeaders as any);
        headers.set('Content-Type', 'text/event-stream');
        headers.set('Connection', 'keep-alive');
        headers.set('Cache-Control', 'no-cache');
        return new Response(stream, { headers });
      }
      console.log('[chat-manager][openai] Response status:', resp.status, 'ok:', resp.ok);
      if (!resp.ok) {
        const errTxt = await resp.text();
        console.error('[chat-manager][openai] Error:', resp.status, errTxt);
        return new Response(JSON.stringify({ reply: 'Erro ao consultar o agente de Marketing. Tente novamente.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const json: any = await resp.json();
      console.log('[chat-manager][openai] Response JSON keys:', Object.keys(json || {}));
      console.log('[chat-manager][openai] Response JSON (full):', JSON.stringify(json).slice(0, 2000));
      let reply = '';
      if (typeof json.output_text === 'string' && json.output_text) {
        console.log('[chat-manager][openai] Using output_text field');
        reply = json.output_text;
      } else if (Array.isArray(json.output)) {
        console.log('[chat-manager][openai] Using output array, blocks:', json.output.length);
        for (const block of json.output) {
          console.log('[chat-manager][openai] Block type:', block?.type, 'has content:', Array.isArray(block?.content));
          if (Array.isArray(block.content)) {
            for (const c of block.content) {
              console.log('[chat-manager][openai] Content item type:', c?.type, 'has text:', !!c?.text);
              if (c?.text) reply += String(c.text);
            }
          }
        }
      } else {
        console.log('[chat-manager][openai] No output_text or output array found');
      }
      if (!reply) {
        console.warn('[chat-manager][openai] Reply is empty after parsing. Fallback message.');
        reply = 'Não consegui processar sua pergunta agora.';
      }
      console.log('[chat-manager][openai] Final reply size:', reply.length, 'preview:', reply.slice(0, 200));
      // Capturar e salvar response id para encadear próximas chamadas
      const responseId: string | null = (json?.id as string) || null;
      if (resolvedSessionId && responseId) {
        await supabase
          .from('chat_sessions')
          .update({ last_response_id: responseId, updated_at: new Date().toISOString() })
          .eq('id', resolvedSessionId);
      } else if (resolvedSessionId) {
        await supabase
          .from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', resolvedSessionId);
      }
      return new Response(JSON.stringify({ reply, session_id: resolvedSessionId || null, response_id: responseId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      // ==== Anthropic (Claude) – fluxo com STREAMING REAL ====
      if (wantStream) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
            try {
              send({ type: 'stream.start' });
              send({ type: 'status', message: 'analisando sua pergunta...' });

              let toolsGuards = 0;
              let fullReply = '';
              let currentConversation = [...workingConversation];
              
              // Loop agentic: streaming real + execução de tools (limite de 10 rounds)
              const MAX_TOOL_ROUNDS = 10;
              while (toolsGuards < MAX_TOOL_ROUNDS) {
                let pendingToolUses: any[] = [];
                
                // Chamar Claude com STREAMING REAL
                const result = await callClaudeStreaming(
                  currentConversation,
                  systemPromptToUse,
                  // onTextDelta: envia cada pedaço de texto em tempo real para o frontend
                  (delta) => {
                    send({ type: 'response.output_text.delta', delta });
                  },
                  // onToolUse: coleta tool_uses para executar depois
                  (toolUses) => {
                    pendingToolUses = toolUses;
                  }
                );
                
                fullReply += result.fullText;
                
                // Se não há tools para executar, terminamos
                if (result.stopReason !== 'tool_use' || pendingToolUses.length === 0) {
                  console.log('[streaming-real] Fim do loop. Stop reason:', result.stopReason);
                  break;
                }
                
                // Executar tools e continuar o loop
                toolsGuards++;
                send({ type: 'status', message: `consultando banco de dados... (${toolsGuards}/${MAX_TOOL_ROUNDS})` });
                console.log('[streaming-real] Executando', pendingToolUses.length, 'tools, round', toolsGuards);
                
                const toolResultsBlocks: any[] = [];
                const toolUsesContent: any[] = [];
                
                for (const tu of pendingToolUses) {
                  toolUsesContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });

                  // Executar cada tool
                  let toolResult = '';
                  try {
                    if (tu.name === 'query_supabase') {
                      const result = await execSupabase(tu.input?.sql);
                      toolResult = JSON.stringify(result);
                    }
                    // ========== SALES COPILOT TOOLS (STREAMING) ==========
                    else if (tu.name === 'create_deal') {
                      const args = tu.input || {};
                      if (!args.lead_id) throw new Error('lead_id é obrigatório');
                      const payload: any = {
                        lead_id: args.lead_id,
                        product_id: args.product_id || null,
                        negotiated_price: Number(args.negotiated_price || 0),
                        original_price: args.original_price ? Number(args.original_price) : null,
                        discount_percent: args.discount_percent ? Number(args.discount_percent) : null,
                        status: args.status || 'open',
                        pipeline_stage_id: args.pipeline_stage_id || null,
                        ai_win_probability: args.ai_win_probability ? Number(args.ai_win_probability) : null,
                        notes: args.notes || null,
                        expected_close_date: args.expected_close_date || null,
                      };
                      const { data, error } = await supabaseAdmin.from('deals').insert(payload).select('id, lead_id, negotiated_price, status').single();
                      if (error) throw error;
                      toolResult = JSON.stringify({ success: true, deal: data });
                    }
                    else if (tu.name === 'update_deal') {
                      const args = tu.input || {};
                      if (!args.deal_id) throw new Error('deal_id é obrigatório');
                      const updates: any = { updated_at: new Date().toISOString() };
                      if (args.negotiated_price !== undefined) updates.negotiated_price = Number(args.negotiated_price);
                      if (args.status) {
                        updates.status = args.status;
                        if (args.status === 'won') updates.won_at = new Date().toISOString();
                        if (args.status === 'lost') updates.lost_at = new Date().toISOString();
                      }
                      if (args.pipeline_stage_id) updates.pipeline_stage_id = args.pipeline_stage_id;
                      if (args.lost_reason) updates.lost_reason = args.lost_reason;
                      if (args.notes) updates.notes = args.notes;
                      const { data, error } = await supabaseAdmin.from('deals').update(updates).eq('id', args.deal_id).select('id, status, negotiated_price').single();
                      if (error) throw error;
                      toolResult = JSON.stringify({ success: true, deal: data });
                    }
                    else if (tu.name === 'update_lead') {
                      const args = tu.input || {};
                      if (!args.lead_id) throw new Error('lead_id é obrigatório');
                      const updates: any = { updated_at: new Date().toISOString() };
                      if (args.sales_score !== undefined) updates.sales_score = Number(args.sales_score);
                      if (args.sales_stage) updates.sales_stage = args.sales_stage;
                      if (args.bant_budget !== undefined) updates.bant_budget = args.bant_budget;
                      if (args.bant_authority !== undefined) updates.bant_authority = args.bant_authority;
                      if (args.bant_need !== undefined) updates.bant_need = args.bant_need;
                      if (args.bant_timeline !== undefined) updates.bant_timeline = args.bant_timeline;
                      if (args.tags) updates.tags = args.tags;
                      if (args.notes) updates.notes = args.notes;
                      const { data, error } = await supabaseAdmin.from('leads').update(updates).eq('id', args.lead_id).select('id, name, sales_score, sales_stage').single();
                      if (error) throw error;
                      toolResult = JSON.stringify({ success: true, lead: data });
                    }
                    else if (tu.name === 'search_leads_ranked') {
                      const args = tu.input || {};
                      const limit = Math.min(Number(args.limit || 10), 50);
                      let query = supabase.from('leads').select('id, name, email, phone, sales_score, sales_stage, bant_budget, bant_authority, bant_need, bant_timeline');
                      if (args.min_score) query = query.gte('sales_score', Number(args.min_score));
                      if (args.stages && Array.isArray(args.stages)) {
                        query = query.in('sales_stage', args.stages);
                      } else {
                        query = query.not('sales_stage', 'in', '("fechado","perdido")');
                      }
                      query = query.order('sales_score', { ascending: false, nullsFirst: false }).limit(limit);
                      const { data, error } = await query;
                      if (error) throw error;
                      toolResult = JSON.stringify({ success: true, count: data?.length || 0, leads: data || [] });
                    }
                    else if (tu.name === 'get_pipeline_summary') {
                      const { data: deals, error } = await supabase.from('deals').select('id, negotiated_price, status');
                      if (error) throw error;
                      const summary = { total: deals?.length || 0, total_value: 0, by_status: { open: 0, won: 0, lost: 0 } };
                      for (const d of (deals || [])) {
                        summary.total_value += Number(d.negotiated_price || 0);
                        summary.by_status[d.status as keyof typeof summary.by_status]++;
                      }
                      toolResult = JSON.stringify({ success: true, summary });
                    }
                    else if (tu.name === 'create_activity') {
                      const args = tu.input || {};
                      const payload = {
                        lead_id: args.lead_id,
                        type: args.type,
                        title: String(args.title || '').slice(0, 200),
                        description: args.description || null,
                        scheduled_at: args.scheduled_at || null,
                        priority: args.priority || 'medium',
                        completed: false,
                        team: 'comercial',
                        source_type: 'ai_copilot',
                        ai_generated: true,
                      };
                      const { data, error } = await supabaseAdmin.from('company_activities').insert(payload).select('id, title, type').single();
                      if (error) throw error;
                      toolResult = JSON.stringify({ success: true, activity: data });
                    }
                    else if (tu.name === 'bulk_analyze_leads') {
                      const args = tu.input || {};
                      const criteria = args.criteria || 'hot_leads';
                      const limit = Math.min(Number(args.limit || 10), 20);
                      let leads: any[] = [];
                      if (criteria === 'hot_leads') {
                        const { data } = await supabase.from('leads').select('id, name, sales_score, sales_stage, phone').gte('sales_score', 70).not('sales_stage', 'in', '("fechado","perdido")').order('sales_score', { ascending: false }).limit(limit);
                        leads = data || [];
                      } else if (criteria === 'stale_deals') {
                        const { data } = await supabase.from('deals').select('id, negotiated_price, status, updated_at, lead:leads!deals_lead_id_fkey(id, name, phone)').eq('status', 'open').lte('updated_at', new Date(Date.now() - 7*24*60*60*1000).toISOString()).order('updated_at').limit(limit);
                        leads = (data || []).map((d: any) => ({ ...d.lead, deal: { id: d.id, negotiated_price: d.negotiated_price } }));
                      } else if (criteria === 'need_followup') {
                        const { data } = await supabase.from('leads').select('id, name, sales_score, phone, updated_at').not('sales_stage', 'in', '("fechado","perdido")').gte('sales_score', 50).lte('updated_at', new Date(Date.now() - 3*24*60*60*1000).toISOString()).order('sales_score', { ascending: false }).limit(limit);
                        leads = data || [];
                      }
                      toolResult = JSON.stringify({ success: true, criteria, count: leads.length, leads });
                    }
                    else if (tu.name === 'create_leads_from_pain') {
                      const args = tu.input || {};
                      const painIds = args.pain_registration_ids || [];
                      const salesStage = args.sales_stage || 'qualificacao';
                      const results: any[] = [];
                      for (const painId of painIds.slice(0, 30)) {
                        const { data: painReg } = await supabase.from('pain_registrations').select('*').eq('id', painId).single();
                        if (!painReg) continue;
                        if (painReg.lead_id) {
                          results.push({ painId, lead_id: painReg.lead_id, status: 'already_linked' });
                          continue;
                        }
                        // Verificar se lead já existe: 1) email, 2) últimos 8 dígitos telefone, 3) instagram
                        let existingLead = null;
                        if (painReg.email) {
                          const { data } = await supabase.from('leads').select('id, name').eq('email', painReg.email).single();
                          existingLead = data;
                        }
                        if (!existingLead && painReg.phone) {
                          const phoneDigits = painReg.phone.replace(/\D/g, '');
                          const last8 = phoneDigits.slice(-8);
                          if (last8.length === 8) {
                            const { data } = await supabase.from('leads').select('id, name, phone').like('phone', `%${last8}`);
                            if (data && data.length === 1) existingLead = data[0];
                          }
                        }
                        if (!existingLead && painReg.instagram) {
                          const { data } = await supabase.from('leads').select('id, name').ilike('instagram', painReg.instagram).single();
                          existingLead = data;
                        }
                        if (existingLead) {
                          await supabaseAdmin.from('pain_registrations').update({ lead_id: existingLead.id }).eq('id', painId);
                          results.push({ painId, lead_id: existingLead.id, name: existingLead.name, status: 'linked_existing' });
                          continue;
                        }
                        // Criar novo lead
                        const { data: newLead } = await supabaseAdmin.from('leads').insert({
                          name: painReg.name, email: painReg.email, phone: painReg.phone,
                          sales_stage: salesStage, source: 'pain_registration',
                          utm_source: painReg.utm_source, utm_campaign: painReg.utm_campaign,
                        }).select('id, name').single();
                        if (newLead) {
                          await supabaseAdmin.from('pain_registrations').update({ lead_id: newLead.id }).eq('id', painId);
                          results.push({ painId, lead_id: newLead.id, name: newLead.name, status: 'created' });
                        }
                      }
                      toolResult = JSON.stringify({ success: true, created: results.filter(r => r.status === 'created').length, linked: results.filter(r => r.status === 'linked_existing').length, leads: results });
                    }
                    else if (tu.name === 'create_deals_batch') {
                      const args = tu.input || {};
                      const leadIds = args.lead_ids || [];
                      const createdDeals = [];
                      for (const leadId of leadIds.slice(0, 30)) {
                        const { data: existing } = await supabaseAdmin.from('deals').select('id').eq('lead_id', leadId).eq('status', 'open').single();
                        if (existing) continue;
                        const { data: newDeal } = await supabaseAdmin.from('deals').insert({
                          lead_id: leadId,
                          product_id: args.product_id || null,
                          negotiated_price: Number(args.negotiated_price || 0),
                          status: 'open',
                          pipeline_stage_id: args.pipeline_stage_id || null,
                          notes: args.notes || 'Criado via Sales Copilot',
                        }).select('id, lead_id, negotiated_price').single();
                        if (newDeal) createdDeals.push(newDeal);
                      }
                      toolResult = JSON.stringify({ success: true, created: createdDeals.length, deals: createdDeals });
                    }
                    // ========== CREATE/UPDATE TASK (STREAMING) ==========
                    else if (tu.name === 'create_task') {
                      const args = tu.input || {};
                      const payload: any = {
                        name: String(args.name || '').slice(0, 120),
                        description: args.description ? String(args.description).slice(0, 2000) : null,
                        assignee: args.assignee ? String(args.assignee).slice(0, 120) : 'A definir',
                        priority: ['low','medium','high','urgent'].includes(String(args.priority)) ? String(args.priority) : 'medium',
                        date: args.date ? String(args.date) : new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0],
                        completed: false,
                        meeting_id: args.meeting_id || null,
                        parent_task_id: args.parent_task_id || null,
                        event_id: args.event_id || null,
                        source_type: 'ai_chat',
                        ai_generated: true,
                        team: 'internal',
                      };
                      const { data, error } = await supabaseAdmin.from('company_activities').insert(payload).select('id, name, assignee, priority, date, completed, event_id').single();
                      if (error) throw error;
                      toolResult = JSON.stringify({ success: true, task: data });
                    }
                    else if (tu.name === 'update_task') {
                      const args = tu.input || {};
                      if (!args.task_id) throw new Error('task_id é obrigatório');
                      const updates: any = {};
                      if (args.completed !== undefined && args.completed !== null) updates.completed = Boolean(args.completed);
                      if (args.completed === true) updates.completed_at = new Date().toISOString();
                      if (args.assignee) updates.assignee = String(args.assignee).slice(0, 120);
                      if (args.priority && ['low','medium','high','urgent'].includes(String(args.priority))) updates.priority = String(args.priority);
                      if (args.date) updates.date = String(args.date);
                      if (args.description) updates.description = String(args.description).slice(0, 2000);
                      if (Object.keys(updates).length === 0) throw new Error('Nenhum campo para atualizar');
                      const { data, error } = await supabaseAdmin.from('company_activities').update(updates).eq('id', args.task_id).select('id, name, assignee, priority, date, completed').single();
                      if (error) throw error;
                      toolResult = JSON.stringify({ success: true, task: data });
                    }
                    else if (tu.name === 'save_instruction') {
                      const args = tu.input || {};
                      if (!args.instruction) throw new Error('instruction é obrigatório');
                      const instruction = String(args.instruction).trim();
                      const category = String(args.category || 'regra_negocio');
                      const categoryLabels: Record<string, string> = {
                        regra_negocio: 'REGRA DE NEGÓCIO',
                        definicao_metrica: 'DEFINIÇÃO DE MÉTRICA',
                        filtro_dados: 'FILTRO DE DADOS',
                        formato_resposta: 'FORMATO DE RESPOSTA',
                        comportamento: 'COMPORTAMENTO',
                        outro: 'INSTRUÇÃO',
                      };
                      const label = categoryLabels[category] || 'INSTRUÇÃO';
                      const newLine = `\n- [${label}] ${instruction}`;
                      // Ler prompt atual do banco (admin para bypass RLS)
                      const { data: currentConfig, error: readErr } = await supabaseAdmin
                        .from('chat_configs')
                        .select('system_prompt')
                        .eq('slug', agentSlug)
                        .single();
                      if (readErr) throw readErr;
                      let currentPrompt = currentConfig?.system_prompt || '';
                      // Append na seção de instruções aprendidas
                      const SECTION_HEADER = '\n\n====== INSTRUÇÕES APRENDIDAS (salvas pelo usuário) ======';
                      if (!currentPrompt.includes('INSTRUÇÕES APRENDIDAS')) {
                        currentPrompt += SECTION_HEADER;
                      }
                      currentPrompt += newLine;
                      // Salvar no banco
                      const { error: updateErr } = await supabaseAdmin
                        .from('chat_configs')
                        .update({ system_prompt: currentPrompt, updated_at: new Date().toISOString() })
                        .eq('slug', agentSlug);
                      if (updateErr) throw updateErr;
                      console.log(`[save_instruction] Saved for ${agentSlug}: [${label}] ${instruction}`);
                      toolResult = JSON.stringify({ success: true, message: `Instrução salva permanentemente: "${instruction}"`, category: label });
                    }
                    else if (tu.name === 'update_system_context') {
                      const args = tu.input || {};
                      if (!args.new_context) throw new Error('new_context é obrigatório');
                      const newPrompt = String(args.new_context);
                      const summary = String(args.change_summary || 'Atualização de contexto');
                      console.log('[streaming] Atualizando system_prompt:', summary);
                      const { data, error } = await supabaseAdmin
                        .from('chat_configs')
                        .update({ system_prompt: newPrompt, updated_at: new Date().toISOString() })
                        .eq('slug', agentSlug)
                        .select('id, slug')
                        .single();
                      if (error) throw error;
                      toolResult = JSON.stringify({ success: true, message: 'Contexto atualizado com sucesso', config: data });
                    }
                    else {
                      toolResult = JSON.stringify({ error: 'Tool não implementada no streaming' });
                    }
                  } catch (e) {
                    toolResult = `Erro: ${(e as any).message}`;
                  }
                  toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: toolResult });
                }

                // Adicionar tool_use e tool_result ao histórico para próxima iteração
                currentConversation.push({ role: 'assistant', content: toolUsesContent });
                currentConversation.push({ role: 'user', content: toolResultsBlocks });
              }
              
              // Se atingiu o limite de rounds e ainda não tem resposta, forçar resposta final SEM tools
              if (!fullReply.trim() && toolsGuards >= MAX_TOOL_ROUNDS) {
                console.log('[streaming-real] Limite de rounds atingido, forçando resposta final sem tools...');
                send({ type: 'status', message: 'gerando resposta final...' });
                
                // Chamar Claude SEM tools para forçar geração de texto
                const finalResponse = await callClaude(currentConversation, systemPromptToUse, false);
                const finalText = (finalResponse.content || [])
                  .filter((b: any) => b.type === 'text')
                  .map((b: any) => b.text)
                  .join('');
                
                if (finalText) {
                  fullReply = finalText;
                  // Enviar o texto em chunks para simular streaming
                  const chunkSize = 20;
                  for (let i = 0; i < finalText.length; i += chunkSize) {
                    send({ type: 'response.output_text.delta', delta: finalText.slice(i, i + chunkSize) });
                  }
                }
              }
              
              // Enviar resposta final
              if (fullReply && fullReply.trim()) {
                send({ type: 'response.output_text.done', text: fullReply });
              } else {
                console.warn('[streaming-real] fullReply vazio');
                send({ type: 'response.output_text.done', text: '🔄 Não consegui gerar uma resposta. Por favor, tente novamente.' });
              }
            } catch (e) {
              const msg = String((e as any)?.message || e || 'Erro desconhecido');
              console.error('[streaming-real] Erro:', msg);
              send({ type: 'response.output_text.done', text: `Houve um erro: ${msg}` });
            } finally {
              controller.close();
            }
          }
        });
        const headers = new Headers(corsHeaders as any);
        headers.set('Content-Type', 'text/event-stream');
        headers.set('Connection', 'keep-alive');
        headers.set('Cache-Control', 'no-cache');
        return new Response(stream, { headers });
      }

      // resposta JSON (não streaming) com auto-continue
      let step = await callClaude(conversationClean, systemPromptToUse);
      let toolsGuards = 0;
      let continueGuards = 0;
      let fullReply = '';
      while (true) {
        // ferramentas
        if (step.stop_reason === 'tool_use' && toolsGuards < 6) {
          toolsGuards++;
          // Batching de ferramentas também no modo não-streaming
          const toolUsesAll = (step.content || []).filter((b: any) => b.type === 'tool_use');
          const BATCH_SIZE = 8;
          const toolUses = toolUsesAll.slice(0, BATCH_SIZE);
          const toolResultsBlocks = [] as any[];
          for (const tu of toolUses) {
            if (tu.name === 'query_supabase') {
              try {
                const args = tu.input;
                const result = await execSupabase(args.sql);
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro: ${(e as any).message}` });
              }
            } else if (tu.name === 'create_task') {
              try {
                const args = tu.input || {};
                const payload: any = {
                  name: String(args.name || '').slice(0, 120),
                  description: args.description ? String(args.description).slice(0, 2000) : null,
                  assignee: args.assignee ? String(args.assignee).slice(0, 120) : 'A definir',
                  priority: ['low','medium','high','urgent'].includes(String(args.priority)) ? String(args.priority) : 'medium',
                  date: args.date ? String(args.date) : new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0],
                  completed: false,
                  meeting_id: args.meeting_id || null,
                  parent_task_id: args.parent_task_id || null,
                  event_id: args.event_id || null,
                  source_type: 'ceo_chat',
                  ai_generated: true,
                };
                const { data, error } = await supabase
                  .from('company_activities')
                  .insert(payload)
                  .select('id, name, assignee, priority, date, completed, parent_task_id')
                  .single();
                if (error) throw error;
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ success: true, task: data }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao criar tarefa: ${(e as any).message}` });
              }
            } else if (tu.name === 'update_task') {
              try {
                const args = tu.input || {};
                const updates: any = {};
                if (args.completed !== undefined && args.completed !== null) updates.completed = Boolean(args.completed);
                if (args.assignee) updates.assignee = String(args.assignee).slice(0, 120);
                if (args.priority && ['low','medium','high','urgent'].includes(String(args.priority))) updates.priority = String(args.priority);
                if (args.date) updates.date = String(args.date);
                if (args.description) updates.description = String(args.description).slice(0, 2000);
                if (Object.keys(updates).length === 0) throw new Error('Nenhum campo para atualizar');
                const { data, error } = await supabase
                  .from('company_activities')
                  .update(updates)
                  .eq('id', args.task_id)
                  .select('id, name, assignee, priority, date, completed')
                  .single();
                if (error) throw error;
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ success: true, task: data }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao atualizar tarefa: ${(e as any).message}` });
              }
            } else if (tu.name === 'update_system_context') {
              try {
                const args = tu.input || {};
                if (!args.new_context) throw new Error('new_context é obrigatório');
                const newPrompt = String(args.new_context);
                const summary = String(args.change_summary || 'Atualização de contexto');
                console.log('[CEO] Atualizando system_prompt:', summary);
                const { data, error } = await supabaseAdmin
                  .from('chat_configs')
                  .update({ system_prompt: newPrompt, updated_at: new Date().toISOString() })
                  .eq('slug', agentSlug)
                  .select('id, slug')
                  .single();
                if (error) throw error;
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ success: true, message: 'Contexto atualizado com sucesso', config: data }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao atualizar contexto: ${(e as any).message}` });
              }
            } else if (tu.name === 'search_images') {
              try {
                const args = tu.input || {};
                const body = {
                  query: String(args.query || ''),
                  count: Math.min(Number(args.count || 2), 12),
                  filters: args.filters || {}
                };
                const resp = await fetch(`${supabaseUrl}/functions/v1/hybrid-image-search`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body)
                });
                const json = await resp.json().catch(() => ({}));
                const first = json?.images?.[0]?.imageUrl || json?.images?.[0]?.url || null;
                const compact = { provider: json?.provider || 'serpapi', q: body.query, selected: first ? { url: first } : null };
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(compact) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao buscar imagens: ${(e as any).message}` });
              }
            } else if (tu.name === 'render_carousel') {
              try {
                const args = tu.input || {};
                const body = { action: 'create-autofill', template_id: args.template_id, autofill_data: args.autofill_data };
                const resp = await fetch(`${supabaseUrl}/functions/v1/templated-api`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body)
                });
                const json = await resp.json().catch(() => ({}));
                const renders = Array.isArray(json) ? json : (Array.isArray(json?.results) ? json.results : []);
                const urls: string[] = Array.isArray(renders)
                  ? renders.map((r: any) => r?.url || r?.download_url || r?.render_url).filter(Boolean)
                  : [];
                let persisted: any = null;
                if (urls.length) {
                  try {
                    let carouselId = args.carousel_id || null;
                    if (!carouselId) {
                      const draftTitle = (args.title && String(args.title)) || `Carrossel renderizado - ${new Date().toISOString()}`;
                      const payload: any = {
                        title: draftTitle,
                        source_url: null,
                        template_id: args.template_id || null,
                        slides: [],
                        status: 'rendered',
                        render_urls: urls
                      };
                      const { data: created } = await supabase
                        .from('content_carousels')
                        .insert(payload)
                        .select('id, title, status, template_id, render_urls')
                        .single();
                      carouselId = created?.id || null;
                      persisted = { carousel: created };
                    } else {
                      const { data: updated } = await supabase
                        .from('content_carousels')
                        .update({ render_urls: urls, status: 'rendered', updated_at: new Date().toISOString() })
                        .eq('id', carouselId)
                        .select('id, title, status, template_id, render_urls')
                        .maybeSingle();
                      persisted = { carousel: updated };
                    }
                    if (persisted?.carousel?.id) {
                      const assets = urls.map((u, idx) => ({ carousel_id: persisted.carousel.id, kind: 'image', url: u, position: idx + 1 }));
                      await supabaseAdmin.from('content_assets').insert(assets);
                      persisted.assets_count = assets.length;
                    }
                  } catch (persistErr) {
                    toolResultsBlocks.push({ type: 'log', tool_use_id: tu.id, content: `Persistência parcial: ${(persistErr as any)?.message}` });
                  }
                }
                const out = { success: true, render_urls: urls, persisted, raw: json };
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao renderizar: ${(e as any).message}` });
              }
            } else if (tu.name === 'save_draft') {
              try {
                const args = tu.input || {};
                const payload: any = {
                  title: String(args.title || '').slice(0, 180),
                  source_url: args.source_url || null,
                  template_id: args.template_id || null,
                  slides: Array.isArray(args.slides) ? args.slides : [],
                  status: (args.status || 'draft')
                };
                const { data, error } = await supabase
                  .from('content_carousels')
                  .insert(payload)
                  .select('id, title, status, template_id')
                  .single();
                if (error) throw error;
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ success: true, carousel: data }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao salvar rascunho: ${(e as any).message}` });
              }
            } else if (tu.name === 'create_kanban_item') {
              try {
                const args = tu.input || {};
                const payload: any = {
                  column_id: String(args.column_id),
                  title: String(args.title || '').slice(0, 180),
                  description: args.description ? String(args.description).slice(0, 2000) : null,
                  assignee: args.assignee ? String(args.assignee).slice(0, 120) : null,
                  priority: args.priority || 'medium',
                  due_date: args.due_date || null,
                  order: 0
                };
                const { data, error } = await supabase
                  .from('content_board_items')
                  .insert(payload)
                  .select('id, column_id, title, priority, due_date')
                  .single();
                if (error) throw error;
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ success: true, item: data }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao criar card: ${(e as any).message}` });
              }
            }
            // ========== HANDLER SAVE INSIGHTS (CS) ==========
            else if (tu.name === 'save_insights') {
              try {
                const args = tu.input || {};
                if (!args.organization_id) throw new Error('organization_id é obrigatório');
                
                const insightsPayload = {
                  summary: args.summary || null,
                  attention_points: args.attention_points || [],
                  opportunities: args.opportunities || [],
                  recommendations: args.recommendations || [],
                  health_score: args.health_score || null,
                  churn_risk: args.churn_risk || null,
                  generated_at: new Date().toISOString(),
                };
                
                const { data, error } = await supabase
                  .from('organizations')
                  .update({ ai_insights: insightsPayload })
                  .eq('id', args.organization_id)
                  .select('id, name, ai_insights')
                  .single();
                
                if (error) throw error;
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ success: true, message: 'Insights salvos com sucesso', organization: data }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao salvar insights: ${(e as any).message}` });
              }
            }
            // ========== HANDLERS SALES COPILOT ==========
            else if (tu.name === 'create_deal') {
              try {
                const args = tu.input || {};
                if (!args.lead_id) throw new Error('lead_id é obrigatório');
                if (!args.negotiated_price) throw new Error('negotiated_price é obrigatório');

                const payload: any = {
                  lead_id: args.lead_id,
                  product_id: args.product_id || null,
                  negotiated_price: Number(args.negotiated_price),
                  original_price: args.original_price ? Number(args.original_price) : null,
                  discount_percent: args.discount_percent ? Number(args.discount_percent) : null,
                  status: args.status || 'open',
                  pipeline_stage_id: args.pipeline_stage_id || null,
                  ai_win_probability: args.ai_win_probability ? Number(args.ai_win_probability) : null,
                  notes: args.notes || null,
                  expected_close_date: args.expected_close_date || null,
                  created_at: new Date().toISOString(),
                };

                const { data, error } = await supabaseAdmin
                  .from('deals')
                  .insert(payload)
                  .select(`
                    id, lead_id, negotiated_price, status, ai_win_probability, notes,
                    lead:leads!deals_lead_id_fkey(id, name),
                    product:products!deals_product_id_fkey(id, name, price)
                  `)
                  .single();

                if (error) throw error;
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ success: true, message: 'Deal criado com sucesso', deal: data }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao criar deal: ${(e as any).message}` });
              }
            }
            else if (tu.name === 'update_deal') {
              try {
                const args = tu.input || {};
                if (!args.deal_id) throw new Error('deal_id é obrigatório');

                const updates: any = { updated_at: new Date().toISOString() };
                if (args.negotiated_price !== undefined && args.negotiated_price !== null) updates.negotiated_price = Number(args.negotiated_price);
                if (args.discount_percent !== undefined && args.discount_percent !== null) updates.discount_percent = Number(args.discount_percent);
                if (args.status) {
                  updates.status = args.status;
                  if (args.status === 'won') updates.won_at = new Date().toISOString();
                  if (args.status === 'lost') updates.lost_at = new Date().toISOString();
                }
                if (args.pipeline_stage_id) updates.pipeline_stage_id = args.pipeline_stage_id;
                if (args.lost_reason) updates.lost_reason = args.lost_reason;
                if (args.notes) updates.notes = args.notes;
                if (args.ai_win_probability !== undefined && args.ai_win_probability !== null) updates.ai_win_probability = Number(args.ai_win_probability);
                if (args.expected_close_date) updates.expected_close_date = args.expected_close_date;

                const { data, error } = await supabaseAdmin
                  .from('deals')
                  .update(updates)
                  .eq('id', args.deal_id)
                  .select(`
                    id, lead_id, negotiated_price, status, ai_win_probability, notes, pipeline_stage_id,
                    lead:leads!deals_lead_id_fkey(id, name),
                    product:products!deals_product_id_fkey(id, name)
                  `)
                  .single();

                if (error) throw error;
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ success: true, message: 'Deal atualizado', deal: data }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao atualizar deal: ${(e as any).message}` });
              }
            }
            else if (tu.name === 'update_lead') {
              try {
                const args = tu.input || {};
                if (!args.lead_id) throw new Error('lead_id é obrigatório');

                const updates: any = { updated_at: new Date().toISOString() };
                if (args.sales_score !== undefined && args.sales_score !== null) updates.sales_score = Number(args.sales_score);
                if (args.sales_stage) updates.sales_stage = args.sales_stage;
                if (args.bant_budget !== undefined) updates.bant_budget = args.bant_budget;
                if (args.bant_authority !== undefined) updates.bant_authority = args.bant_authority;
                if (args.bant_need !== undefined) updates.bant_need = args.bant_need;
                if (args.bant_timeline !== undefined) updates.bant_timeline = args.bant_timeline;
                if (args.tags) updates.tags = args.tags;
                if (args.notes) updates.notes = args.notes;

                const { data, error } = await supabaseAdmin
                  .from('leads')
                  .update(updates)
                  .eq('id', args.lead_id)
                  .select('id, name, email, phone, sales_score, sales_stage, bant_budget, bant_authority, bant_need, bant_timeline, tags')
                  .single();

                if (error) throw error;
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ success: true, message: 'Lead atualizado', lead: data }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao atualizar lead: ${(e as any).message}` });
              }
            }
            else if (tu.name === 'search_leads_ranked') {
              try {
                const args = tu.input || {};
                const limit = Math.min(Number(args.limit || 10), 50);

                let query = supabase
                  .from('leads')
                  .select(`
                    id, name, email, phone, sales_score, sales_stage,
                    bant_budget, bant_authority, bant_need, bant_timeline,
                    utm_source, utm_campaign, created_at, updated_at
                  `);

                // Filtros
                if (args.min_score) {
                  query = query.gte('sales_score', Number(args.min_score));
                }
                if (args.stages && Array.isArray(args.stages)) {
                  query = query.in('sales_stage', args.stages);
                } else {
                  // Por padrão, exclui leads fechados ou perdidos
                  query = query.not('sales_stage', 'in', '("fechado","perdido")');
                }

                // Ordenação
                const orderBy = args.order_by || 'score_desc';
                if (orderBy === 'score_desc') {
                  query = query.order('sales_score', { ascending: false, nullsFirst: false });
                } else if (orderBy === 'created_desc') {
                  query = query.order('created_at', { ascending: false });
                } else if (orderBy === 'recent_activity') {
                  query = query.order('updated_at', { ascending: false });
                }

                query = query.limit(limit);

                const { data, error } = await query;

                if (error) throw error;

                // Para cada lead, buscar dados adicionais se necessário
                const enrichedLeads = [];
                for (const lead of (data || [])) {
                  const enriched: any = { ...lead };

                  // Contar mensagens WhatsApp recentes
                  if (args.has_whatsapp || args.has_recent_activity) {
                    const { count: msgCount } = await supabase
                      .from('whatsapp_messages')
                      .select('id', { count: 'exact', head: true })
                      .eq('lead_id', lead.id)
                      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
                    enriched.recent_messages = msgCount || 0;

                    if (args.has_whatsapp && !msgCount) continue;
                    if (args.has_recent_activity && !msgCount) continue;
                  }

                  // Buscar deals abertos
                  const { data: deals } = await supabase
                    .from('deals')
                    .select('id, negotiated_price, status')
                    .eq('lead_id', lead.id)
                    .eq('status', 'open')
                    .limit(3);
                  enriched.open_deals = deals || [];

                  enrichedLeads.push(enriched);
                }

                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({
                  success: true,
                  count: enrichedLeads.length,
                  leads: enrichedLeads
                }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao buscar leads: ${(e as any).message}` });
              }
            }
            else if (tu.name === 'get_pipeline_summary') {
              try {
                const args = tu.input || {};

                // Buscar todos os deals com informações de estágio
                let query = supabase
                  .from('deals')
                  .select(`
                    id, negotiated_price, status, created_at, won_at, lost_at,
                    pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(id, name, order)
                  `);

                if (args.sales_rep_id) {
                  query = query.eq('sales_rep_id', args.sales_rep_id);
                }
                if (args.date_from) {
                  query = query.gte('created_at', args.date_from);
                }
                if (args.date_to) {
                  query = query.lte('created_at', args.date_to);
                }

                const { data: deals, error } = await query;

                if (error) throw error;

                // Calcular métricas
                const summary = {
                  total_deals: deals?.length || 0,
                  total_value: 0,
                  won_value: 0,
                  lost_count: 0,
                  open_count: 0,
                  by_stage: {} as any,
                  by_status: { open: 0, won: 0, lost: 0 },
                  avg_deal_value: 0,
                  win_rate: 0,
                };

                for (const deal of (deals || [])) {
                  summary.total_value += Number(deal.negotiated_price || 0);
                  summary.by_status[deal.status as keyof typeof summary.by_status]++;

                  if (deal.status === 'won') {
                    summary.won_value += Number(deal.negotiated_price || 0);
                  }

                  // Agrupar por estágio
                  const stageName = (deal.pipeline_stage as any)?.name || 'Sem estágio';
                  if (!summary.by_stage[stageName]) {
                    summary.by_stage[stageName] = { count: 0, value: 0 };
                  }
                  summary.by_stage[stageName].count++;
                  summary.by_stage[stageName].value += Number(deal.negotiated_price || 0);
                }

                summary.open_count = summary.by_status.open;
                summary.lost_count = summary.by_status.lost;
                summary.avg_deal_value = summary.total_deals ? summary.total_value / summary.total_deals : 0;

                const closedDeals = summary.by_status.won + summary.by_status.lost;
                summary.win_rate = closedDeals ? (summary.by_status.won / closedDeals) * 100 : 0;

                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({
                  success: true,
                  summary
                }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao obter resumo do pipeline: ${(e as any).message}` });
              }
            }
            else if (tu.name === 'create_activity') {
              try {
                const args = tu.input || {};
                if (!args.lead_id) throw new Error('lead_id é obrigatório');
                if (!args.type) throw new Error('type é obrigatório');
                if (!args.title) throw new Error('title é obrigatório');

                const payload: any = {
                  lead_id: args.lead_id,
                  type: args.type,
                  title: String(args.title).slice(0, 200),
                  description: args.description ? String(args.description).slice(0, 2000) : null,
                  scheduled_at: args.scheduled_at || null,
                  priority: args.priority || 'medium',
                  completed: false,
                  team: 'comercial',
                  source_type: 'ai_copilot',
                  ai_generated: true,
                };

                const { data, error } = await supabaseAdmin
                  .from('company_activities')
                  .insert(payload)
                  .select('id, lead_id, type, title, scheduled_at, priority')
                  .single();

                if (error) throw error;
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ success: true, message: 'Atividade criada', activity: data }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao criar atividade: ${(e as any).message}` });
              }
            }
            else if (tu.name === 'bulk_analyze_leads') {
              try {
                const args = tu.input || {};
                const criteria = args.criteria || 'hot_leads';
                const limit = Math.min(Number(args.limit || 10), 20);

                let leads: any[] = [];

                if (criteria === 'hot_leads') {
                  // Leads com alto score e atividade recente
                  const { data } = await supabase
                    .from('leads')
                    .select('id, name, sales_score, sales_stage, phone, email')
                    .gte('sales_score', 70)
                    .not('sales_stage', 'in', '("fechado","perdido")')
                    .order('sales_score', { ascending: false })
                    .limit(limit);
                  leads = data || [];
                }
                else if (criteria === 'stale_deals') {
                  // Deals sem atividade há mais de 7 dias
                  const { data } = await supabase
                    .from('deals')
                    .select(`
                      id, negotiated_price, status, updated_at,
                      lead:leads!deals_lead_id_fkey(id, name, phone)
                    `)
                    .eq('status', 'open')
                    .lte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
                    .order('updated_at', { ascending: true })
                    .limit(limit);
                  leads = (data || []).map((d: any) => ({ ...d.lead, deal: { id: d.id, negotiated_price: d.negotiated_price, days_stale: Math.floor((Date.now() - new Date(d.updated_at).getTime()) / (24*60*60*1000)) } }));
                }
                else if (criteria === 'high_potential') {
                  // Leads com BANT quase completo mas sem deal
                  const { data } = await supabase
                    .from('leads')
                    .select('id, name, sales_score, sales_stage, phone, email, bant_budget, bant_authority, bant_need, bant_timeline')
                    .not('sales_stage', 'in', '("fechado","perdido")')
                    .order('sales_score', { ascending: false })
                    .limit(50);

                  // Filtrar os que tem pelo menos 3 de 4 BANT
                  leads = (data || []).filter((l: any) => {
                    const bantCount = [l.bant_budget, l.bant_authority, l.bant_need, l.bant_timeline].filter(Boolean).length;
                    return bantCount >= 3;
                  }).slice(0, limit);
                }
                else if (criteria === 'need_followup') {
                  // Leads sem contato há mais de 3 dias
                  const { data } = await supabase
                    .from('leads')
                    .select('id, name, sales_score, sales_stage, phone, updated_at')
                    .not('sales_stage', 'in', '("fechado","perdido")')
                    .gte('sales_score', 50)
                    .lte('updated_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
                    .order('sales_score', { ascending: false })
                    .limit(limit);
                  leads = (data || []).map((l: any) => ({ ...l, days_since_contact: Math.floor((Date.now() - new Date(l.updated_at).getTime()) / (24*60*60*1000)) }));
                }

                // Enriquecer com contagem de mensagens WhatsApp
                const enrichedLeads = [];
                for (const lead of leads) {
                  const leadId = lead.id;
                  const { count: msgCount } = await supabase
                    .from('whatsapp_messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('lead_id', leadId);

                  enrichedLeads.push({
                    ...lead,
                    total_messages: msgCount || 0,
                  });
                }

                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({
                  success: true,
                  criteria,
                  count: enrichedLeads.length,
                  leads: enrichedLeads,
                  recommendation: criteria === 'hot_leads'
                    ? 'Esses leads têm alto potencial. Priorize contato imediato!'
                    : criteria === 'stale_deals'
                    ? 'Esses deals estão esfriando. Faça follow-up urgente!'
                    : criteria === 'high_potential'
                    ? 'BANT quase completo. Crie oportunidades para esses leads!'
                    : 'Esses leads precisam de follow-up. Não deixe esfriar!'
                }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro na análise em lote: ${(e as any).message}` });
              }
            }
            else if (tu.name === 'create_leads_from_pain') {
              try {
                const args = tu.input || {};
                if (!args.pain_registration_ids || !Array.isArray(args.pain_registration_ids)) {
                  throw new Error('pain_registration_ids é obrigatório (array de UUIDs)');
                }

                const salesStage = args.sales_stage || 'qualificacao';
                const results = [];
                const errors = [];

                for (const painId of args.pain_registration_ids.slice(0, 50)) {
                  // Buscar registro do PAIN
                  const { data: painReg, error: painError } = await supabase
                    .from('pain_registrations')
                    .select('*')
                    .eq('id', painId)
                    .single();

                  if (painError || !painReg) {
                    errors.push({ painId, error: 'Registro não encontrado' });
                    continue;
                  }

                  // Se já tem lead_id, retornar
                  if (painReg.lead_id) {
                    results.push({ painId, lead_id: painReg.lead_id, name: painReg.name, status: 'already_linked' });
                    continue;
                  }

                  // VERIFICAR SE LEAD JÁ EXISTE: 1) email, 2) últimos 8 dígitos do telefone, 3) instagram
                  let existingLead = null;

                  // 1. Buscar por email
                  if (painReg.email) {
                    const { data } = await supabase
                      .from('leads')
                      .select('id, name')
                      .eq('email', painReg.email)
                      .single();
                    existingLead = data;
                  }

                  // 2. Buscar pelos últimos 8 dígitos do telefone
                  if (!existingLead && painReg.phone) {
                    const phoneDigits = painReg.phone.replace(/\D/g, ''); // Remove não-dígitos
                    const last8Digits = phoneDigits.slice(-8);
                    if (last8Digits.length === 8) {
                      const { data } = await supabase
                        .from('leads')
                        .select('id, name, phone')
                        .like('phone', `%${last8Digits}`);
                      if (data && data.length === 1) {
                        existingLead = data[0];
                      }
                    }
                  }

                  // 3. Buscar por instagram (se tiver)
                  if (!existingLead && painReg.instagram) {
                    const { data } = await supabase
                      .from('leads')
                      .select('id, name')
                      .ilike('instagram', painReg.instagram)
                      .single();
                    existingLead = data;
                  }

                  if (existingLead) {
                    // Lead existe, apenas vincular
                    await supabaseAdmin
                      .from('pain_registrations')
                      .update({ lead_id: existingLead.id })
                      .eq('id', painId);

                    results.push({ painId, lead_id: existingLead.id, name: existingLead.name, status: 'linked_existing' });
                    continue;
                  }

                  // Lead não existe, criar novo
                  const { data: newLead, error: leadError } = await supabaseAdmin
                    .from('leads')
                    .insert({
                      name: painReg.name,
                      email: painReg.email,
                      phone: painReg.phone,
                      sales_stage: salesStage,
                      source: 'pain_registration',
                      utm_source: painReg.utm_source,
                      utm_campaign: painReg.utm_campaign,
                      notes: `Interesse no PAIN: ${painReg.payment_option || 'não especificado'}`,
                    })
                    .select('id, name')
                    .single();

                  if (leadError) {
                    errors.push({ painId, error: leadError.message });
                    continue;
                  }

                  // Atualizar pain_registrations com o lead_id
                  await supabaseAdmin
                    .from('pain_registrations')
                    .update({ lead_id: newLead.id })
                    .eq('id', painId);

                  results.push({ painId, lead_id: newLead.id, name: newLead.name, status: 'created' });
                }

                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({
                  success: true,
                  created: results.filter(l => l.status === 'created').length,
                  linked_existing: results.filter(l => l.status === 'linked_existing').length,
                  already_linked: results.filter(l => l.status === 'already_linked').length,
                  errors: errors.length,
                  leads: results,
                  error_details: errors
                }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao criar leads: ${(e as any).message}` });
              }
            }
            else if (tu.name === 'create_deals_batch') {
              try {
                const args = tu.input || {};
                if (!args.lead_ids || !Array.isArray(args.lead_ids)) {
                  throw new Error('lead_ids é obrigatório (array de UUIDs)');
                }
                if (!args.negotiated_price) {
                  throw new Error('negotiated_price é obrigatório');
                }

                const createdDeals = [];
                const errors = [];

                for (const leadId of args.lead_ids.slice(0, 50)) {
                  // Verificar se lead existe
                  const { data: lead, error: leadError } = await supabaseAdmin
                    .from('leads')
                    .select('id, name')
                    .eq('id', leadId)
                    .single();

                  if (leadError || !lead) {
                    errors.push({ leadId, error: 'Lead não encontrado' });
                    continue;
                  }

                  // Verificar se já tem deal aberto
                  const { data: existingDeal } = await supabaseAdmin
                    .from('deals')
                    .select('id')
                    .eq('lead_id', leadId)
                    .eq('status', 'open')
                    .single();

                  if (existingDeal) {
                    errors.push({ leadId, name: lead.name, error: 'Já possui deal aberto', deal_id: existingDeal.id });
                    continue;
                  }

                  // Criar deal
                  const { data: newDeal, error: dealError } = await supabaseAdmin
                    .from('deals')
                    .insert({
                      lead_id: leadId,
                      product_id: args.product_id || null,
                      negotiated_price: Number(args.negotiated_price),
                      status: 'open',
                      pipeline_stage_id: args.pipeline_stage_id || null,
                      notes: args.notes || 'Criado via Sales Copilot',
                    })
                    .select('id, lead_id, negotiated_price')
                    .single();

                  if (dealError) {
                    errors.push({ leadId, name: lead.name, error: dealError.message });
                    continue;
                  }

                  createdDeals.push({ deal_id: newDeal.id, lead_id: leadId, name: lead.name, value: newDeal.negotiated_price });
                }

                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({
                  success: true,
                  created: createdDeals.length,
                  errors: errors.length,
                  total_value: createdDeals.reduce((sum, d) => sum + Number(d.value), 0),
                  deals: createdDeals,
                  error_details: errors
                }) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro ao criar deals em lote: ${(e as any).message}` });
              }
            }
            // ========== HANDLERS MCP - META ADS (modo não-streaming) ==========
            else if (tu.name.startsWith('mcp_')) {
              try {
                const result = await callMcpServer(tu.name, tu.input || {});
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
              } catch (e) {
                toolResultsBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro MCP: ${(e as any).message}` });
              }
            }
          }
          // Construir conteúdo assistant SOMENTE com o lote atual de tool_use
          const assistantBatchContent = toolUses.map((tu: any) => ({
            type: 'tool_use',
            id: tu.id,
            name: tu.name,
            input: tu.input,
          }));
          // Par mínimo para respeitar o contrato assistant(tool_use) -> user(tool_result)
          if (toolResultsBlocks.length === 0) {
            const firstId = toolUses?.[0]?.id || 'noop';
            toolResultsBlocks.push({ type: 'tool_result', tool_use_id: firstId, content: 'ok' });
          }
          // Persistir no histórico para manter contexto em iterações seguintes
          workingConversation.push({ role: 'assistant', content: assistantBatchContent });
          workingConversation.push({ role: 'user', content: toolResultsBlocks });
          // Tool rounds NÃO são persistidos (só ficam em memória durante o ciclo)
          // Inclui o último contexto de texto do usuário + par estruturado tool_use/tool_result
          const baseContext = workingConversation
            .filter((m) => typeof m.content === 'string' && (m.content || '').trim().toLowerCase() !== 'continue')
            .slice(-4);
          const minimal = [
            ...baseContext,
            { role: 'assistant', content: assistantBatchContent },
            { role: 'user', content: toolResultsBlocks }
          ];
          step = await callClaude(minimal, systemPromptToUse);
          continue;
        }

        // agregar texto
        fullReply += extractAssistantText(step);
        if (step.stop_reason === 'max_tokens' && continueGuards < 4) {
          continueGuards++;
          // Extrair só texto antes de adicionar ao histórico
          const textOnly = extractAssistantText(step);
          workingConversation.push({ role: 'assistant', content: textOnly });
          workingConversation.push({ role: 'user', content: 'continue' });
          step = await callClaude(workingConversation, systemPromptToUse);
          continue;
        }
        break;
      }
      const reply = fullReply || 'Não consegui processar sua pergunta agora.';
      console.log("Resposta final:", reply); // Log: Resposta final
      // Frontend (ChatAIClaude.jsx) já persiste a resposta final após receber JSON
      return new Response(JSON.stringify({ reply, session_id: resolvedSessionId || null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("chat-manager error:", e); // Log existente
    return new Response(JSON.stringify({
      reply: "Erro no chat. Tente novamente em instantes."
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});

