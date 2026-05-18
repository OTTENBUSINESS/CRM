import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-2.5-flash";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const GEMINI_API_KEY = await getIntegrationKey(supabase, "GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.warn("[extract-meeting-datetime] GEMINI_API_KEY nao configurada em /configuracoes > Integrações");
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, lead_name } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Brasília timezone correto (toLocaleString garante dia correto independente do UTC)
    const nowUtc = new Date();
    const brTimeStr = nowUtc.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const now = new Date(brTimeStr);
    const diasSemana = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
    const dataHoje = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const diaSemana = diasSemana[now.getDay()];

    const conversationText = messages
      .map((m: any) => `[${m.is_from_me ? "Vendedor" : "Lead"}] ${m.content}`)
      .join("\n");

    const systemPrompt = `Analise as mensagens de WhatsApp abaixo e extraia a data/hora de uma reunião, call ou meet combinada entre vendedor e lead.

DATA DE HOJE: ${dataHoje} (${diaSemana})
NOME DO LEAD: ${lead_name || "Lead"}

REGRAS:
1. Procure menções a datas e horários para reunião/call/meet/apresentação/demonstração
2. Interprete referências relativas: "amanhã", "segunda", "semana que vem", "depois de amanhã", "na quinta", etc.
3. Se encontrar, retorne a data/hora em formato ISO (YYYY-MM-DDTHH:mm)
4. Sugira um título curto e descritivo para a reunião
5. Se NÃO encontrar data/hora combinada, retorne found: false
6. Considere apenas combinações claras (não suposições)

Responda APENAS em JSON válido:
{ "found": true, "datetime": "YYYY-MM-DDTHH:mm", "title": "Título sugerido" }
ou
{ "found": false }`;

    const userMessage = `MENSAGENS:\n${conversationText}`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini error:", errorText);
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const aiContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiContent) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result;
    try {
      const cleanContent = aiContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");

      result = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Parse error:", aiContent);
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ found: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
