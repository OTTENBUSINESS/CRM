import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let GEMINI_API_KEY = "";

const EVALUATION_PROMPT = `Você é um coach de vendas sênior avaliando um roleplay de treinamento.

O vendedor praticou uma call de vendas com um "cliente" simulado por IA.

## Dados da sessão
- Cliente: {{PERSONA_NAME}} ({{PERSONA_ROLE}}, {{PERSONA_COMPANY}})
- Cenário: {{SCENARIO}}
- Duração: {{DURATION}}

## Transcrição
{{TRANSCRIPT}}

## Sua tarefa
Avalie a performance do VENDEDOR (não do cliente). Seja honesto, específico e construtivo. Use exemplos concretos da transcrição.

Retorne um JSON válido com EXATAMENTE esta estrutura:

{
  "nota_geral": 75,
  "veredicto": "sim | nao | talvez",
  "veredicto_motivo": "Motivo em 1-2 frases de por que o cliente compraria ou não",
  "fases": [
    {
      "nome": "Abertura / Rapport",
      "nota": 80,
      "feedback": "Feedback específico sobre a abertura"
    },
    {
      "nome": "Discovery / Diagnóstico",
      "nota": 70,
      "feedback": "Feedback sobre como investigou necessidades"
    },
    {
      "nome": "Proposta de Valor",
      "nota": 65,
      "feedback": "Feedback sobre como apresentou a solução"
    },
    {
      "nome": "Tratamento de Objeções",
      "nota": 60,
      "feedback": "Feedback sobre como lidou com objeções"
    },
    {
      "nome": "Fechamento / Próximo Passo",
      "nota": 50,
      "feedback": "Feedback sobre como tentou avançar"
    }
  ],
  "pontos_fortes": [
    "Ponto forte específico 1 com exemplo",
    "Ponto forte específico 2"
  ],
  "pontos_fracos": [
    "Ponto fraco específico 1 com exemplo",
    "Ponto fraco específico 2"
  ],
  "frases_melhorar": [
    {
      "original": "Frase exata que o vendedor disse",
      "sugestao": "Como deveria ter dito",
      "motivo": "Por que a sugestão é melhor"
    }
  ],
  "objecoes": [
    {
      "objecao": "Objeção que o cliente trouxe",
      "tratou": true,
      "qualidade": "Como o vendedor tratou (ou deveria ter tratado)"
    }
  ],
  "dica_final": "Uma dica prática e acionável para a próxima call"
}

REGRAS:
1. Notas de 0 a 100. Seja realista — vendedor mediano tira 50-65, bom tira 70-85, excelente 85+.
2. "veredicto" = se esse cliente REAL compraria baseado nessa call.
3. Em "frases_melhorar", cite a frase EXATA da transcrição.
4. Em "objecoes", liste TODAS as objeções do cliente e se o vendedor tratou.
5. Retorne APENAS o JSON, sem markdown, sem backticks.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const { transcript, persona, scenario, duration } = await req.json();

    if (!transcript?.trim()) {
      throw new Error("Transcrição vazia");
    }

    const scenarioLabels: Record<string, string> = {
      discovery: "Discovery — primeira conversa",
      proposal: "Proposta — apresentando solução",
      closing: "Fechamento — tentando fechar",
      objection: "Tratamento de objeções",
    };

    const durationMin = Math.floor(duration / 60);
    const durationSec = duration % 60;

    const prompt = EVALUATION_PROMPT
      .replace("{{PERSONA_NAME}}", persona.name)
      .replace("{{PERSONA_ROLE}}", persona.role)
      .replace("{{PERSONA_COMPANY}}", persona.company)
      .replace("{{SCENARIO}}", scenarioLabels[scenario] || scenario)
      .replace("{{DURATION}}", `${durationMin}min ${durationSec}s`)
      .replace("{{TRANSCRIPT}}", transcript);

    // Use Gemini 2.0 Flash for fast evaluation
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const err = await geminiResponse.text();
      console.error("Gemini error:", err);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error("Resposta vazia do Gemini");
    }

    // Parse JSON (Gemini with responseMimeType should return clean JSON)
    let evaluation;
    try {
      evaluation = JSON.parse(responseText);
    } catch {
      // Try extracting JSON from markdown
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Resposta não é JSON válido");
      }
    }

    return new Response(
      JSON.stringify(evaluation),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Roleplay evaluate error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
