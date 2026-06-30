import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { isAuthorizedCaller, unauthorizedResponse } from "../_shared/requireCaller.ts";
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

const systemPrompt = `Você é um assistente especializado em analisar transcrições de reuniões de equipe.

Sua tarefa é:
1. Gerar um RESUMO EXECUTIVO da reunião
2. Identificar DECISÕES tomadas
3. Extrair TAREFAS/AÇÕES mencionadas com responsáveis
4. Identificar PRÓXIMOS PASSOS
5. Destacar PONTOS IMPORTANTES

IMPORTANTE:
- Extraia APENAS informações que foram explicitamente mencionadas
- Identifique quem é responsável por cada tarefa (se mencionado)
- Seja objetivo e direto
- Priorize tarefas por urgência quando possível

Retorne um JSON válido com a seguinte estrutura:

{
  "resumo_executivo": "Resumo de 2-3 parágrafos sobre o que foi discutido na reunião",
  "duracao_estimada": "Ex: 45 minutos",
  "participantes_identificados": ["Nome 1", "Nome 2"],
  "decisoes": [
    {
      "decisao": "Descrição da decisão tomada",
      "contexto": "Breve contexto de por que foi decidido"
    }
  ],
  "tarefas_sugeridas": [
    {
      "titulo": "Título curto da tarefa",
      "descricao": "Descrição detalhada do que precisa ser feito",
      "responsavel_sugerido": "Nome da pessoa (se mencionado) ou null",
      "prioridade": "high|medium|low",
      "prazo_sugerido": "Ex: Esta semana, Até sexta, 15/02, etc",
      "tipo_sugerido": "call|email|meeting|follow_up|internal"
    }
  ],
  "proximos_passos": [
    "Próximo passo 1",
    "Próximo passo 2"
  ],
  "pontos_importantes": [
    "Ponto importante 1",
    "Ponto importante 2"
  ],
  "riscos_identificados": [
    "Risco ou preocupação mencionada"
  ],
  "sentimento_geral": "positivo|neutro|negativo|misto",
  "energia_reuniao": "produtiva|moderada|improdutiva"
}

Retorne APENAS o JSON, sem explicações adicionais.`;

serve(async (req) => {
  if (req.method !== "OPTIONS" && !isAuthorizedCaller(req)) return unauthorizedResponse();
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meeting_id, transcription, meeting_title, participants } = await req.json();

    if (!meeting_id || !transcription) {
      return new Response(
        JSON.stringify({ error: "meeting_id e transcription são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Criar cliente Supabase
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  GEMINI_API_KEY = (await getIntegrationKey(supabase, "GEMINI_API_KEY")) || "";

    // Buscar dados da reunião
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select(`
        *,
        organization:organizations(id, name),
        lead:leads(id, name)
      `)
      .eq("id", meeting_id)
      .single();

    if (meetingError) {
      console.error("Erro ao buscar meeting:", meetingError);
    }

    // Preparar contexto
    const contextInfo = meeting_title
      ? `Título da reunião: ${meeting_title}\n`
      : "";

    const participantsInfo = participants?.length
      ? `Participantes: ${participants.join(", ")}\n`
      : "";

    const orgInfo = meeting?.organization?.name
      ? `Cliente/Organização: ${meeting.organization.name}\n`
      : "";

    const userPrompt = `${contextInfo}${participantsInfo}${orgInfo}

TRANSCRIÇÃO DA REUNIÃO:
---
${transcription}
---

Analise a transcrição acima e gere o resumo estruturado da reunião.`;

    // Chamar Gemini 2.5 Pro
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt + "\n\n" + userPrompt }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4000,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Erro Gemini:", errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao processar com IA", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const aiContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiContent) {
      console.error("Resposta Gemini sem conteúdo:", JSON.stringify(geminiData));
      return new Response(
        JSON.stringify({ error: "IA não retornou conteúdo", response: geminiData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parsear JSON da resposta
    let meetingSummary;
    try {
      const cleanContent = aiContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      meetingSummary = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Erro ao parsear JSON da IA:", parseError);
      console.error("Conteúdo recebido:", aiContent);
      return new Response(
        JSON.stringify({ error: "Erro ao parsear resposta da IA", content: aiContent }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atualizar meeting com o resumo
    const { error: updateError } = await supabase
      .from("meetings")
      .update({
        summary: meetingSummary.resumo_executivo,
        key_points: meetingSummary.pontos_importantes || [],
        ai_analysis: meetingSummary,
        status: "processed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", meeting_id);

    if (updateError) {
      console.error("Erro ao atualizar meeting:", updateError);
      return new Response(
        JSON.stringify({ error: "Erro ao salvar resumo", details: updateError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Retornar sucesso
    return new Response(
      JSON.stringify({
        success: true,
        meeting_summary: meetingSummary,
        message: "Reunião processada com sucesso",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro geral:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
