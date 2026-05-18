import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let GEMINI_API_KEY = "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// ─── Prompt QUICK (Flash) ───────────────────────────────────────────────
const DEFAULT_QUICK_PROMPT = `Você é um especialista em análise de calls de vendas. Analise a transcrição e extraia insights essenciais de forma concisa.

DATA DE HOJE: {{DATA_HOJE}}

Retorne um JSON válido com EXATAMENTE esta estrutura:

{
  "diagnostico": "Resumo executivo da ligação em 2-3 frases.",
  "pontos_chave": ["Ponto relevante 1", "Ponto relevante 2", "Ponto relevante 3"],
  "riscos": ["Risco ou objeção 1", "Risco ou objeção 2"],
  "proximo_passo": "Ação clara e específica que o vendedor deve tomar",
  "sentimento": "positive | neutral | negative",
  "tarefas_sugeridas": [
    {
      "titulo": "Título curto da tarefa",
      "descricao": "O que precisa ser feito",
      "prioridade": "high | medium | low",
      "prazo_sugerido": "hoje | amanha | esta_semana | proxima_semana",
      "data_hora_especifica": "YYYY-MM-DDTHH:mm ou null"
    }
  ],
  "dados_extraidos": {
    "empresa": "Nome da empresa se mencionado",
    "cargo": "Cargo se mencionado",
    "necessidade": "Necessidade principal",
    "orcamento": "Info de orçamento",
    "timeline": "Prazo/urgência",
    "decisor": "Se é decisor",
    "concorrentes": "Concorrentes mencionados",
    "genero": "masculino | feminino | desconhecido",
    "tipo_negocio": "digital | varejo | clinica | saas | servicos | industria | outro",
    "faixa_faturamento": "ate_10k | 10k_50k | 50k_100k | 100k_500k | 500k_plus | desconhecido",
    "is_icp": "true | false"
  },
  "score_adjustment": 0
}

INSTRUÇÕES:
1. Extraia APENAS informações explícitas na transcrição
2. score_adjustment: número de -20 a +20
3. proximo_passo: UMA ação clara e executável
4. Se data/hora específica mencionada, calcule baseado na data de hoje (formato ISO)
5. Retorne APENAS o JSON, sem markdown`;

// ─── Prompt DEEP (Pro) ──────────────────────────────────────────────────
const DEFAULT_DEEP_PROMPT = `Você é um especialista sênior em análise de calls de vendas. Analise a transcrição em profundidade e gere uma análise completa com insights estratégicos.

DATA DE HOJE: {{DATA_HOJE}}

Retorne um JSON válido com EXATAMENTE esta estrutura:

{
  "diagnostico": "Resumo executivo da ligação em 2-3 frases. Inclua: o que foi discutido, posição do lead no funil, e probabilidade de fechamento.",

  "perfil_lead": "Parágrafo descritivo completo do perfil do lead: quem é, como se comportou na call, estilo de comunicação, nível de interesse, maturidade de compra, e personalidade percebida.",

  "pontos_chave": [
    "Ponto relevante 1 - algo importante que o lead disse ou demonstrou",
    "Ponto relevante 2",
    "Ponto relevante 3"
  ],

  "riscos": [
    "Risco ou objeção identificada 1",
    "Risco ou objeção identificada 2"
  ],

  "negociacao": {
    "desfecho": "Resumo do resultado da negociação nesta call (ex: 'Lead pediu proposta', 'Ainda avaliando', 'Fechou verbal')",
    "detalhes": "Detalhes relevantes da negociação: valores discutidos, condições, objeções de preço, comparações com concorrentes"
  },

  "pontos_fortes_vendedor": [
    "Aspecto positivo 1 da atuação do vendedor",
    "Aspecto positivo 2"
  ],

  "veredicto": {
    "probabilidade": 65,
    "justificativa": "Explicação de 2-3 frases sobre a probabilidade de fechamento, considerando BANT, engajamento e sinais de compra"
  },

  "recomendacao_estrategica": "Parágrafo com recomendação estratégica detalhada: como abordar este lead nas próximas interações, que argumentos usar, timing ideal, e como superar as objeções identificadas.",

  "proximo_passo": "Ação clara e específica que o vendedor deve tomar como próximo passo",

  "sentimento": "positive | neutral | negative",

  "tarefas_sugeridas": [
    {
      "titulo": "Título curto da tarefa",
      "descricao": "Descrição detalhada do que precisa ser feito",
      "prioridade": "high | medium | low",
      "prazo_sugerido": "hoje | amanha | esta_semana | proxima_semana",
      "data_hora_especifica": "YYYY-MM-DDTHH:mm se uma data/hora específica foi mencionada, caso contrário null"
    }
  ],

  "dados_extraidos": {
    "empresa": "Nome da empresa do lead se mencionado",
    "cargo": "Cargo do lead se mencionado",
    "necessidade": "Principal necessidade identificada",
    "orcamento": "Informações sobre orçamento se mencionadas",
    "timeline": "Prazo/urgência mencionados",
    "decisor": "Se o lead é decisor ou precisa consultar alguém",
    "concorrentes": "Concorrentes mencionados",
    "genero": "masculino | feminino | desconhecido",
    "tipo_negocio": "digital | varejo | clinica | saas | servicos | industria | outro",
    "faixa_faturamento": "ate_10k | 10k_50k | 50k_100k | 100k_500k | 500k_plus | desconhecido",
    "is_icp": "true | false"
  },

  "score_adjustment": 0
}

INSTRUÇÕES IMPORTANTES:
1. Extraia APENAS informações explícitas na transcrição
2. O campo "score_adjustment" deve ser um número de -20 a +20 para ajustar o score do lead
3. Priorize tarefas que tenham impacto direto no fechamento
4. O "proximo_passo" deve ser UMA ação clara e executável
5. Se não houver informação para um campo, deixe vazio ou array vazio
6. Retorne APENAS o JSON, sem explicações ou markdown
7. Se data/hora específica mencionada, calcule a data real baseada na data de hoje (formato ISO YYYY-MM-DDTHH:mm)
8. "perfil_lead": Seja detalhista e descritivo, isso ajuda o vendedor a entender com quem está lidando
9. "veredicto.probabilidade": número de 0 a 100 representando chance de fechamento
10. "pontos_fortes_vendedor": Destaque o que o vendedor fez bem para reforço positivo
11. "recomendacao_estrategica": Seja específico e acionável, não genérico`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { call_id, transcription, lead_id, lead_name, team_member_id, meeting_id, meeting_type, depth = 'quick' } = await req.json();

    console.log("🚀 [analyze-sales-call] Iniciando análise");
    console.log("📞 call_id:", call_id);
    console.log("📝 transcription length:", transcription?.length);
    console.log("👤 lead_name:", lead_name);
    console.log("🔍 depth:", depth);
    console.log("🏷️ meeting_type:", meeting_type || "sales_call (default)");

    if (!call_id || !transcription) {
      return new Response(
        JSON.stringify({ error: "call_id e transcription são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Criar cliente Supabase
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  GEMINI_API_KEY = (await getIntegrationKey(supabase, "GEMINI_API_KEY")) || "";

    // Selecionar modelo e prompt baseado no depth
    const isDeep = depth === 'deep';
    const model = isDeep ? 'gemini-2.5-pro' : 'gemini-2.0-flash';
    const maxOutputTokens = isDeep ? 4096 : 2048;

    // Determinar categoria do template baseado no meeting_type + depth
    const MEETING_TYPE_TO_CATEGORY: Record<string, string> = {
      cs_meeting: "cs_meeting_analysis",
      onboarding: "onboarding_analysis",
      internal: "internal_meeting_analysis",
      sales_call: "call_analysis",
    };
    const baseCategory = MEETING_TYPE_TO_CATEGORY[meeting_type || "sales_call"] || "call_analysis";
    const templateCategory = isDeep && baseCategory === 'call_analysis' ? 'call_analysis_deep' : baseCategory;
    const defaultPrompt = isDeep ? DEFAULT_DEEP_PROMPT : DEFAULT_QUICK_PROMPT;

    console.log(`🤖 [Model] ${model} (depth: ${depth})`);
    console.log("📋 [Template] Buscando categoria:", templateCategory);

    // Buscar prompt configurável (template) — tenta a categoria específica primeiro
    let systemPrompt = defaultPrompt;

    const { data: template } = await supabase
      .from("analysis_templates")
      .select("prompt")
      .eq("category", templateCategory)
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    if (template?.prompt) {
      systemPrompt = template.prompt;
      console.log(`📋 [Template] Usando prompt customizado (${templateCategory})`);
    } else if (templateCategory !== "call_analysis") {
      // Fallback: se não tem template para CS/onboarding, tenta o genérico de call_analysis
      const { data: fallbackTemplate } = await supabase
        .from("analysis_templates")
        .select("prompt")
        .eq("category", "call_analysis")
        .eq("is_default", true)
        .eq("is_active", true)
        .single();

      if (fallbackTemplate?.prompt) {
        systemPrompt = fallbackTemplate.prompt;
        console.log("📋 [Template] Fallback para call_analysis");
      } else {
        // Para CS, usar um prompt adaptado mesmo sem template
        if (meeting_type === "cs_meeting") {
          systemPrompt = systemPrompt.replace(
            "calls de vendas",
            "reuniões de Customer Success"
          ).replace(
            "extrair insights acionáveis para o vendedor",
            "extrair insights acionáveis para o time de CS sobre saúde do cliente, riscos de churn, e próximos passos de acompanhamento"
          ).replace(
            "posição do lead no funil, e probabilidade de fechamento",
            "estado atual do cliente, nível de satisfação, e pontos de atenção"
          ).replace(
            "impacto direto no fechamento",
            "impacto direto na retenção e sucesso do cliente"
          );
        }
        console.log("📋 [Template] Usando prompt padrão" + (meeting_type === "cs_meeting" ? " (adaptado para CS)" : ""));
      }
    } else {
      console.log(`📋 [Template] Usando prompt padrão (${templateCategory})`);
    }

    // Substituir placeholder de data
    const hoje = new Date();
    const dataHoje = hoje.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const dataHojeISO = hoje.toISOString().split('T')[0];

    systemPrompt = systemPrompt.replace('{{DATA_HOJE}}', `${dataHoje} (${dataHojeISO})`);
    console.log("📅 [Data] Data de hoje:", dataHoje, `(${dataHojeISO})`);

    // Buscar contexto do lead se disponível
    let leadContext = "";
    if (lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select(`
          name, email, phone, company, position, source, status, sales_score,
          bant_budget, bant_authority, bant_need, bant_timeline,
          ai_conversation_insights
        `)
        .eq("id", lead_id)
        .single();

      if (lead) {
        leadContext = `
CONTEXTO DO LEAD (informações já conhecidas):
- Nome: ${lead.name || "N/A"}
- Empresa: ${lead.company || "N/A"}
- Cargo: ${lead.position || "N/A"}
- Score atual: ${lead.sales_score || 0}/100
- Status: ${lead.status || "N/A"}
- Orçamento (BANT): ${lead.bant_budget || "N/A"}
- Autoridade (BANT): ${lead.bant_authority || "N/A"}
- Necessidade (BANT): ${lead.bant_need || "N/A"}
- Timeline (BANT): ${lead.bant_timeline || "N/A"}

Considere este contexto ao analisar a chamada.
`;
        console.log("👤 [Lead] Contexto carregado");
      }
    }

    // Formatar transcrição se for array de segmentos
    let formattedTranscription = transcription;
    if (Array.isArray(transcription)) {
      formattedTranscription = transcription
        .filter((t: any) => t.is_final !== false)
        .map((t: any) => `${t.speaker}: ${t.text}`)
        .join("\n");
    }

    // Chamar Gemini
    console.log(`🤖 [Gemini] Chamando ${model}...`);
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}

${leadContext}

TRANSCRIÇÃO DA ${meeting_type === 'cs_meeting' ? 'REUNIÃO DE CS' : meeting_type === 'onboarding' ? 'REUNIÃO DE ONBOARDING' : meeting_type === 'internal' ? 'REUNIÃO INTERNA' : 'LIGAÇÃO DE VENDAS'}:
---
${formattedTranscription}
---

Analise a transcrição acima e gere a análise estruturada. Retorne APENAS o JSON válido.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("❌ [Gemini] Erro:", errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao processar com IA", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const finishReason = geminiData.candidates?.[0]?.finishReason;
    const aiContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    console.log(`🔍 [Gemini] finishReason: ${finishReason}, content length: ${aiContent?.length || 0}`);
    if (finishReason === 'MAX_TOKENS') {
      console.warn(`⚠️ [Gemini] Resposta truncada por MAX_TOKENS! Considere aumentar maxOutputTokens.`);
    }

    if (!aiContent) {
      console.error("❌ [Gemini] Nenhum conteúdo retornado");
      return new Response(
        JSON.stringify({ error: "IA não retornou conteúdo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parsear JSON da resposta
    let analysis;
    try {
      console.log("🔍 [Gemini RAW] Resposta completa:");
      console.log(aiContent);

      let cleanContent = aiContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      // Tentar parse direto
      try {
        analysis = JSON.parse(cleanContent);
      } catch (_firstParseErr) {
        // Fallback: JSON pode estar truncado pelo Gemini (maxOutputTokens)
        // Tentar fechar chaves/colchetes abertos
        console.warn("⚠️ [Parse] JSON direto falhou, tentando reparar truncamento...");
        let repaired = cleanContent;
        // Remover última linha incompleta (valor string cortado no meio)
        const lastNewline = repaired.lastIndexOf('\n');
        if (lastNewline > repaired.length * 0.5) {
          repaired = repaired.substring(0, lastNewline);
        }
        // Fechar strings abertas
        const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
        if (quoteCount % 2 !== 0) repaired += '"';
        // Fechar colchetes/chaves abertos
        const opens = (repaired.match(/[\[{]/g) || []).length;
        const closes = (repaired.match(/[\]}]/g) || []).length;
        for (let i = 0; i < opens - closes; i++) {
          // Detectar se último container aberto era [ ou {
          const lastOpen = Math.max(repaired.lastIndexOf('['), repaired.lastIndexOf('{'));
          const lastClose = Math.max(repaired.lastIndexOf(']'), repaired.lastIndexOf('}'));
          if (lastOpen > lastClose) {
            repaired += repaired[lastOpen] === '[' ? ']' : '}';
          } else {
            repaired += '}';
          }
        }
        // Remover trailing commas antes de } ou ]
        repaired = repaired.replace(/,\s*([}\]])/g, '$1');
        analysis = JSON.parse(repaired);
        console.log("✅ [Parse] JSON reparado com sucesso (resposta truncada pelo Gemini)");
      }

      // Marcar o depth na análise
      analysis.analysis_depth = depth;

      console.log("✅ [Parse] Análise parseada com sucesso");

      // LOG: Detalhe das tarefas sugeridas
      if (analysis.tarefas_sugeridas && analysis.tarefas_sugeridas.length > 0) {
        analysis.tarefas_sugeridas.forEach((tarefa: any, index: number) => {
          console.log(`  Tarefa ${index + 1}: ${tarefa.titulo} (${tarefa.prioridade}, ${tarefa.prazo_sugerido})`);
        });
      }
    } catch (parseError) {
      console.error("❌ [Parse] Erro ao parsear JSON:", parseError);
      console.error("❌ [Parse] Conteúdo que falhou:", aiContent);
      return new Response(
        JSON.stringify({ error: "Erro ao parsear resposta da IA", content: aiContent }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atualizar call_history com a análise
    const { error: updateCallError } = await supabase
      .from("call_history")
      .update({
        ai_summary: analysis.diagnostico,
        ai_sentiment: analysis.sentimento,
        ai_key_points: analysis.pontos_chave,
        ai_suggested_tasks: analysis.tarefas_sugeridas,
        ai_processed_at: new Date().toISOString(),
        metadata: {
          ...analysis,
          ai_analysis: analysis,
          analysis_depth: depth,
        },
      })
      .eq("id", call_id);

    if (updateCallError) {
      console.error("❌ [DB] Erro ao atualizar call_history:", updateCallError);
    } else {
      console.log("✅ [DB] call_history atualizado");
    }

    // Atualizar lead se existir (APENAS para sales_call — CS não mexe em dados comerciais do lead)
    const isSalesCall = !meeting_type || meeting_type === 'sales_call';
    if (lead_id && isSalesCall) {
      // Buscar score atual
      const { data: currentLead } = await supabase
        .from("leads")
        .select("sales_score, ai_conversation_insights")
        .eq("id", lead_id)
        .single();

      if (currentLead) {
        const currentScore = currentLead.sales_score || 50;
        const newScore = Math.max(0, Math.min(100, currentScore + analysis.score_adjustment));

        // Atualizar insights de conversa
        const insights = currentLead.ai_conversation_insights || {};
        const callHistory = insights.call_history || [];

        // Manter últimas 5 análises
        const newCallHistory = [
          {
            call_id,
            date: new Date().toISOString(),
            sentiment: analysis.sentimento,
            summary: analysis.diagnostico,
            score_adjustment: analysis.score_adjustment,
          },
          ...callHistory.slice(0, 4),
        ];

        // Preparar campos de perfil (só sobrescrever se a IA extraiu dados válidos)
        const profileFields: Record<string, any> = {};
        const dados = analysis.dados_extraidos;
        if (dados?.genero && dados.genero !== 'desconhecido') {
          profileFields.gender = dados.genero;
        }
        if (dados?.tipo_negocio && dados.tipo_negocio !== 'outro') {
          profileFields.business_type = dados.tipo_negocio;
        }
        if (dados?.faixa_faturamento && dados.faixa_faturamento !== 'desconhecido') {
          profileFields.revenue_range = dados.faixa_faturamento;
        }
        if (typeof dados?.is_icp === 'boolean' || dados?.is_icp === 'true' || dados?.is_icp === 'false') {
          profileFields.is_icp = dados.is_icp === true || dados.is_icp === 'true';
        }

        await supabase
          .from("leads")
          .update({
            sales_score: newScore,
            bant_budget: dados?.orcamento || currentLead.bant_budget,
            bant_authority: dados?.decisor || currentLead.bant_authority,
            bant_need: dados?.necessidade || currentLead.bant_need,
            bant_timeline: dados?.timeline || currentLead.bant_timeline,
            ...profileFields,
            ai_conversation_insights: {
              ...insights,
              last_call_analysis: analysis,
              call_history: newCallHistory,
            },
            ai_last_analysis_at: new Date().toISOString(),
          })
          .eq("id", lead_id);

        console.log(`✅ [Lead] Score atualizado: ${currentScore} -> ${newScore}`);
      }
    }

    // Log resumo
    console.log(`📊 [Análise ${depth}] diagnostico: ${analysis.diagnostico?.substring(0, 80)}...`);
    console.log(`  sentimento: ${analysis.sentimento}, tarefas: ${analysis.tarefas_sugeridas?.length || 0}, score_adj: ${analysis.score_adjustment}`);
    if (isDeep) {
      console.log(`  veredicto: ${analysis.veredicto?.probabilidade}%, perfil: ${analysis.perfil_lead ? 'sim' : 'não'}`);
    }

    // Retornar análise completa
    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        depth,
        message: `Chamada analisada com sucesso (${depth})`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ [Error] Erro geral:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
