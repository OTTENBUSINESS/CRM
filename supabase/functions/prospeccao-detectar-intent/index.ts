// ============================================================
// prospeccao-detectar-intent
// Recebe query livre ("clínicas de estética em São Paulo")
// Retorna { nicho, tipo, cidade, uf, fontes_sugeridas, query_otimizada }
// Usa Gemini Flash + lista os nichos do banco como contexto
// verify_jwt: false
// ============================================================

import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";
import { loadPrompt } from "./load_prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return json({ error: "query é obrigatório" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const GEMINI_API_KEY = await getIntegrationKey(supabase, "GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY não configurada" }, 500);

    // Carrega nichos disponíveis pra dar contexto ao modelo
    const { data: nichos } = await supabase
      .from("prospeccao_templates_nicho")
      .select("nicho, display_name, descricao, fontes_obrigatorias, fontes_opcionais")
      .eq("is_active", true);

    const nichosCatalogo = (nichos || [])
      .map(
        (n) =>
          `- ${n.nicho}: ${n.display_name} (${n.descricao}). Fontes: ${[
            ...(n.fontes_obrigatorias || []),
            ...(n.fontes_opcionais || []),
          ].join(", ")}`
      )
      .join("\n");
    const cfg = await loadPrompt(supabase, "detectar_intent", {
      nichos_catalogo: nichosCatalogo,
      query,
    }, {
      prompt_text: `Classifica intent de prospecção. Nichos: ${nichosCatalogo}. Query: "${query}". Retorne JSON com nicho, tipo, cidade, uf, fontes_sugeridas, query_otimizada, confianca.`,
      ai_model: GEMINI_MODEL,
      temperature: 0.2,
    });

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.ai_model}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: cfg.prompt_text }] }],
        generationConfig: {
          temperature: cfg.temperature,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("[detectar-intent] Gemini error:", errText);
      return json({ error: "Falha ao detectar intent", detalhes: errText }, 500);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let intent;
    try {
      intent = JSON.parse(rawText);
    } catch {
      console.error("[detectar-intent] JSON parse fail:", rawText);
      intent = {
        nicho: "outro",
        tipo: query,
        cidade: null,
        uf: null,
        fontes_sugeridas: ["google_maps", "site", "instagram"],
        query_otimizada: query,
        confianca: 0.3,
      };
    }

    // Garante shape mínimo
    intent.nicho = intent.nicho || "outro";
    intent.fontes_sugeridas = Array.isArray(intent.fontes_sugeridas) && intent.fontes_sugeridas.length > 0
      ? intent.fontes_sugeridas
      : ["google_maps", "site", "instagram"];
    intent.query_otimizada = intent.query_otimizada || query;
    intent.confianca = typeof intent.confianca === "number" ? intent.confianca : 0.5;

    return json({ intent });
  } catch (err) {
    console.error("[detectar-intent] Erro:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
