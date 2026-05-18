import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let GEMINI_API_KEY = "";

const systemPrompt = `Você é um assistente especializado em extrair informações de leads a partir de screenshots de conversas (WhatsApp, Instagram, etc).

Analise a imagem e extraia as seguintes informações se estiverem visíveis:
- Nome da pessoa (pode estar no perfil, na conversa, ou assinatura)
- Telefone (formato brasileiro, com DDD)
- Email
- Instagram/Username (se visível)
- Contexto COMPLETO da conversa (transcreva TODO o conteúdo relevante da conversa, com máximo de detalhes)

IMPORTANTE:
- Se o telefone estiver no formato +55 21 97930-2822, retorne apenas os números: 5521979302822
- Se encontrar @usuario ou ~@usuario, retorne sem o @ ou ~@
- Se não encontrar alguma informação, retorne null
- O contexto deve conter a TRANSCRIÇÃO COMPLETA de todas as mensagens visíveis, não resuma! Inclua quem disse o quê.
- Preserve os detalhes importantes como: o que a pessoa quer, qual o problema dela, o que ela está buscando

Retorne APENAS um JSON válido no formato:
{
  "name": "Nome da Pessoa" ou null,
  "phone": "5521979302822" ou null,
  "email": "email@exemplo.com" ou null,
  "instagram": "usuario" ou null,
  "context": "TRANSCRIÇÃO COMPLETA da conversa com todos os detalhes" ou null,
  "confidence": "high" | "medium" | "low"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("📸 Iniciando extração de lead da imagem...");

    // Hidratar GEMINI_API_KEY da tabela config
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    GEMINI_API_KEY = (await getIntegrationKey(supabase, "GEMINI_API_KEY")) || "";

    const body = await req.json();
    const { image_base64 } = body;

    if (!image_base64) {
      console.error("❌ image_base64 não fornecido");
      return new Response(
        JSON.stringify({ error: "image_base64 é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📦 Tamanho da imagem base64: ${image_base64.length} caracteres`);

    if (!GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY não configurada");
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remover prefixo data:image/...;base64, se existir
    const base64Data = image_base64.replace(/^data:image\/[^;]+;base64,/, '');
    
    // Detectar mime type
    let mimeType = "image/png";
    if (image_base64.startsWith("data:image/jpeg")) mimeType = "image/jpeg";
    else if (image_base64.startsWith("data:image/webp")) mimeType = "image/webp";
    else if (image_base64.startsWith("data:image/gif")) mimeType = "image/gif";
    
    console.log(`🖼️ Mime type detectado: ${mimeType}`);
    console.log(`📦 Tamanho base64 limpo: ${base64Data.length} caracteres`);

    // Chamar Gemini Vision API
    console.log("🤖 Chamando Gemini 2.5 Pro API...");
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("❌ Erro Gemini:", errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao processar imagem com IA", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("✅ Resposta Gemini:", responseText.substring(0, 200));

    // Extrair JSON da resposta
    let extractedData;
    try {
      // Tentar encontrar JSON na resposta
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
        console.log("✅ Dados extraídos:", JSON.stringify(extractedData));
      } else {
        throw new Error("JSON não encontrado na resposta");
      }
    } catch (parseError) {
      console.error("⚠️ Erro ao parsear resposta:", responseText);
      extractedData = {
        name: null,
        phone: null,
        email: null,
        instagram: null,
        context: responseText || null,
        confidence: "low",
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Erro geral:", error.message, error.stack);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
