import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let OPENAI_API_KEY = "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const analysisPrompt = `Você é um especialista em análise de chamadas comerciais.

Analise a transcrição desta chamada de WhatsApp e extraia informações estruturadas.

IMPORTANTE:
- Extraia APENAS informações que foram explicitamente mencionadas
- Identifique claramente quem é o vendedor/atendente e quem é o cliente
- Seja objetivo e preciso
- Foque em ações e próximos passos

Retorne um JSON válido com a seguinte estrutura:

{
  "resumo": "Resumo executivo de 2-3 frases da chamada",
  "sentimento": "positive|neutral|negative",
  "pontos_principais": ["Ponto importante 1", "Ponto importante 2"],
  "objecoes": ["Objeção ou preocupação mencionada"],
  "compromissos": ["Compromisso assumido durante a call"],
  "tarefas_sugeridas": [
    {
      "titulo": "Título da tarefa",
      "descricao": "Descrição detalhada",
      "prioridade": "high|medium|low",
      "categoria": "followup|proposal|meeting|documentation|other"
    }
  ],
  "dados_extraidos": {
    "empresa": "Nome da empresa mencionada ou null",
    "cargo": "Cargo do interlocutor ou null",
    "necessidade": "Necessidade identificada ou null",
    "orcamento": "Orçamento mencionado ou null",
    "prazo": "Prazo mencionado ou null",
    "decisor": "Quem decide ou null"
  },
  "score_adjustment": número de -15 a +15 baseado no tom da chamada
}

Retorne APENAS o JSON, sem explicações adicionais.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { call_id } = await req.json();

    if (!call_id) {
      return new Response(
        JSON.stringify({ error: "call_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ProcessCallRecording] Iniciando processamento para call_id: ${call_id}`);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  OPENAI_API_KEY = (await getIntegrationKey(supabase, "OPENAI_API_KEY")) || "";

    // Buscar a chamada
    const { data: call, error: callError } = await supabase
      .from("call_history")
      .select(`
        *,
        lead:leads(id, name, email, phone, sales_score, sales_rep_id),
        device:wavoip_devices(id, team_member_id)
      `)
      .eq("id", call_id)
      .single();

    if (callError || !call) {
      console.error("[ProcessCallRecording] Chamada não encontrada:", callError);
      return new Response(
        JSON.stringify({ error: "Chamada não encontrada", details: callError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determinar URL de gravação (principal ou fallback do WaVoIP metadata)
    let recordUrl = call.record_url || call.metadata?.wavoip_record_url;

    if (!recordUrl) {
      console.error("[ProcessCallRecording] Chamada sem URL de gravação");
      return new Response(
        JSON.stringify({ error: "Chamada sem URL de gravação" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isWavoipUrl = recordUrl.includes("storage.wavoip.com");
    const isSupabaseUrl = recordUrl.includes("supabase");

    console.log(`[ProcessCallRecording] URL de gravação: ${recordUrl} (wavoip=${isWavoipUrl}, supabase=${isSupabaseUrl})`);

    // Baixar o áudio da gravação
    let audioResponse;
    try {
      audioResponse = await fetch(recordUrl);
      if (!audioResponse.ok) {
        // Se URL principal falhou, tentar fallback do metadata
        if (call.record_url && call.metadata?.wavoip_record_url && recordUrl !== call.metadata.wavoip_record_url) {
          console.log("[ProcessCallRecording] URL principal falhou, tentando wavoip_record_url do metadata...");
          recordUrl = call.metadata.wavoip_record_url;
          audioResponse = await fetch(recordUrl);
          if (!audioResponse.ok) {
            throw new Error(`HTTP ${audioResponse.status}: ${audioResponse.statusText}`);
          }
        } else {
          throw new Error(`HTTP ${audioResponse.status}: ${audioResponse.statusText}`);
        }
      }
    } catch (downloadError) {
      console.error("[ProcessCallRecording] Erro ao baixar gravação:", downloadError);

      await supabase
        .from("call_history")
        .update({
          ai_processing_error: `Erro ao baixar gravação: ${downloadError.message}`,
        })
        .eq("id", call_id);

      return new Response(
        JSON.stringify({ error: "Erro ao baixar gravação", details: downloadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se a gravação veio do WaVoIP, re-upload para Supabase Storage
    if (!isSupabaseUrl || recordUrl.includes("storage.wavoip.com")) {
      console.log("[ProcessCallRecording] Re-uploading WaVoIP recording to Supabase Storage...");
      try {
        const audioBytes = await audioResponse.arrayBuffer();
        const fileName = `${call_id}.mp3`;
        const storagePath = `recordings/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("call-recordings")
          .upload(storagePath, audioBytes, {
            contentType: "audio/mpeg",
            upsert: true,
          });

        if (uploadError) {
          console.error("[ProcessCallRecording] Erro no upload para Storage:", uploadError);
        } else {
          // Obter URL pública
          const { data: publicUrlData } = supabase.storage
            .from("call-recordings")
            .getPublicUrl(storagePath);

          if (publicUrlData?.publicUrl) {
            recordUrl = publicUrlData.publicUrl;
            console.log(`[ProcessCallRecording] Re-upload OK. Nova URL: ${recordUrl}`);

            // Atualizar record_url no banco para a URL do Supabase
            await supabase
              .from("call_history")
              .update({ record_url: recordUrl })
              .eq("id", call_id);
          }
        }

        // Reconstituir audioResponse para o Whisper (já consumimos o body)
        audioResponse = new Response(audioBytes, {
          headers: { "Content-Type": "audio/mpeg" },
        });
      } catch (reuploadError) {
        console.error("[ProcessCallRecording] Erro no re-upload (continuando com URL original):", reuploadError);
        // Não bloquear o processamento — continuar com o áudio já baixado
      }
    }

    const audioBlob = await audioResponse.blob();
    console.log(`[ProcessCallRecording] Áudio baixado: ${audioBlob.size} bytes`);

    // Transcrever com Whisper
    console.log("[ProcessCallRecording] Enviando para transcrição Whisper...");

    const formData = new FormData();
    formData.append("file", audioBlob, "recording.mp3");
    formData.append("model", "whisper-1");
    formData.append("language", "pt");
    formData.append("response_format", "text");

    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error("[ProcessCallRecording] Erro Whisper:", errorText);

      await supabase
        .from("call_history")
        .update({
          ai_processing_error: `Erro na transcrição: ${errorText}`,
        })
        .eq("id", call_id);

      return new Response(
        JSON.stringify({ error: "Erro na transcrição", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transcription = await whisperResponse.text();
    console.log(`[ProcessCallRecording] Transcrição concluída: ${transcription.length} caracteres`);

    // Salvar transcrição imediatamente
    await supabase
      .from("call_history")
      .update({
        transcription: transcription,
      })
      .eq("id", call_id);

    // Preparar contexto para análise
    const leadContext = call.lead ? `
CONTEXTO DO LEAD:
- Nome: ${call.lead.name}
- Email: ${call.lead.email || "N/A"}
- Telefone: ${call.lead.phone || "N/A"}
- Score atual: ${call.lead.sales_score || 0}
` : "";

    const callContext = `
INFORMAÇÕES DA CHAMADA:
- Direção: ${call.direction === 'INCOMING' ? 'Recebida' : 'Realizada'}
- Duração: ${call.duration_seconds || 0} segundos
- Data: ${call.started_at}
`;

    // Analisar com GPT-4
    console.log("[ProcessCallRecording] Analisando com GPT-4...");

    const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: analysisPrompt },
          {
            role: "user",
            content: `${leadContext}${callContext}

TRANSCRIÇÃO DA CHAMADA:
---
${transcription}
---

Analise a transcrição acima e gere o JSON estruturado com insights e tarefas sugeridas.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!gptResponse.ok) {
      const errorText = await gptResponse.text();
      console.error("[ProcessCallRecording] Erro GPT:", errorText);

      await supabase
        .from("call_history")
        .update({
          ai_processing_error: `Erro na análise: ${errorText}`,
          ai_processed_at: new Date().toISOString(),
        })
        .eq("id", call_id);

      return new Response(
        JSON.stringify({ error: "Erro na análise", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gptData = await gptResponse.json();
    const aiContent = gptData.choices[0]?.message?.content;

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: "IA não retornou conteúdo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parsear JSON
    let analysis;
    try {
      const cleanContent = aiContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analysis = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("[ProcessCallRecording] Erro ao parsear JSON:", parseError);

      await supabase
        .from("call_history")
        .update({
          ai_processing_error: `Erro ao parsear análise: ${parseError.message}`,
          ai_processed_at: new Date().toISOString(),
        })
        .eq("id", call_id);

      return new Response(
        JSON.stringify({ error: "Erro ao parsear resposta da IA", content: aiContent }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[ProcessCallRecording] Análise concluída:", analysis.resumo);

    // Atualizar call_history com todos os resultados
    const updateData = {
      ai_summary: analysis.resumo,
      ai_sentiment: analysis.sentimento,
      ai_key_points: analysis.pontos_principais || [],
      ai_suggested_tasks: analysis.tarefas_sugeridas || [],
      ai_processed_at: new Date().toISOString(),
      ai_processing_error: null,
      metadata: {
        ...call.metadata,
        ai_analysis: {
          objecoes: analysis.objecoes,
          compromissos: analysis.compromissos,
          dados_extraidos: analysis.dados_extraidos,
          score_adjustment: analysis.score_adjustment,
        },
      },
    };

    await supabase
      .from("call_history")
      .update(updateData)
      .eq("id", call_id);

    // Se tem lead, atualizar score e insights
    if (call.lead?.id) {
      const currentScore = call.lead.sales_score || 50;
      const scoreAdjustment = analysis.score_adjustment || 0;
      const newScore = Math.max(0, Math.min(100, currentScore + scoreAdjustment));

      const leadUpdate: Record<string, unknown> = {
        ai_last_analysis_at: new Date().toISOString(),
      };

      if (Math.abs(newScore - currentScore) >= 3) {
        leadUpdate.sales_score = newScore;
      }

      // Extrair dados do lead se disponíveis
      if (analysis.dados_extraidos) {
        if (analysis.dados_extraidos.orcamento) {
          leadUpdate.bant_budget = analysis.dados_extraidos.orcamento;
        }
        if (analysis.dados_extraidos.decisor) {
          leadUpdate.bant_authority = analysis.dados_extraidos.decisor;
        }
        if (analysis.dados_extraidos.necessidade) {
          leadUpdate.bant_need = analysis.dados_extraidos.necessidade;
        }
        if (analysis.dados_extraidos.prazo) {
          leadUpdate.bant_timeline = analysis.dados_extraidos.prazo;
        }
      }

      await supabase
        .from("leads")
        .update(leadUpdate)
        .eq("id", call.lead.id);

      // Criar tarefas sugeridas automaticamente
      if (analysis.tarefas_sugeridas && analysis.tarefas_sugeridas.length > 0) {
        const tasks = analysis.tarefas_sugeridas.map((task: any) => ({
          lead_id: call.lead.id,
          assignee_id: call.lead.sales_rep_id || call.device?.team_member_id,
          activity_type: task.categoria === 'meeting' ? 'meeting' : 'task',
          title: task.titulo,
          description: `[Auto-gerado da chamada] ${task.descricao}`,
          priority: task.prioridade === 'high' ? 8 : task.prioridade === 'medium' ? 5 : 3,
          status: 'pending',
          due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // +3 dias
          metadata: {
            source: 'call_ai_analysis',
            call_id: call_id,
            categoria: task.categoria,
          },
        }));

        await supabase
          .from("company_activities")
          .insert(tasks);

        console.log(`[ProcessCallRecording] ${tasks.length} tarefas criadas`);
      }

      // Criar alerta se necessário
      if (analysis.sentimento === "positive" ||
          (analysis.tarefas_sugeridas && analysis.tarefas_sugeridas.some((t: any) => t.prioridade === "high"))) {
        await supabase.from("sales_alerts").insert({
          lead_id: call.lead.id,
          sales_rep_id: call.lead.sales_rep_id,
          alert_type: "call_analyzed",
          title: `Chamada analisada: ${call.lead.name}`,
          description: analysis.resumo,
          priority: analysis.sentimento === "positive" ? 7 : 5,
          metadata: {
            call_id: call_id,
            direction: call.direction,
            duration: call.duration_seconds,
            sentiment: analysis.sentimento,
            suggested_tasks_count: analysis.tarefas_sugeridas?.length || 0,
          },
        });
      }
    }

    // Notificar frontend via broadcast channel (realtime)
    await supabase
      .channel("call-processed")
      .send({
        type: "broadcast",
        event: "call_ai_processed",
        payload: {
          call_id: call_id,
          lead_id: call.lead?.id,
          summary: analysis.resumo,
          sentiment: analysis.sentimento,
          suggested_tasks: analysis.tarefas_sugeridas,
        },
      });

    console.log(`[ProcessCallRecording] Processamento concluído para call_id: ${call_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        call_id,
        transcription_length: transcription.length,
        analysis: {
          resumo: analysis.resumo,
          sentimento: analysis.sentimento,
          pontos_principais: analysis.pontos_principais,
          tarefas_sugeridas: analysis.tarefas_sugeridas,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ProcessCallRecording] Erro geral:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
