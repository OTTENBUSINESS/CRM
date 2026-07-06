// ============================================================
// prospeccao-gerar-mensagem
// Gera mensagem cold no tom Frank a partir do diagnóstico
// Pode ser pra WhatsApp, IG DM, ou genérica
// verify_jwt: false
// ============================================================

import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";

interface Input {
  diagnostico_id: string;
  canal: "whatsapp" | "instagram_dm" | "email";
  variant?: number; // 0/1/2 — força o modelo a gerar versão diferente
  user_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { diagnostico_id, canal = "whatsapp", variant = 0 }: Input = await req.json();
    if (!diagnostico_id) return json({ error: "diagnostico_id obrigatório" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const GEMINI_API_KEY = await getIntegrationKey(supabase, "GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY não configurada" }, 500);

    const { data: diag, error } = await supabase
      .from("prospeccao_diagnosticos")
      .select("*")
      .eq("id", diagnostico_id)
      .single();
    if (error || !diag) return json({ error: "Diagnóstico não encontrado" }, 404);

    const { data: lead } = await supabase
      .from("prospeccao_leads_descobertos")
      .select("*")
      .eq("id", diag.lead_descoberto_id)
      .single();

    // Compacta achados mais críticos
    const achadosCompactos: string[] = [];
    const fontesAchados: Array<{ key: string; col: string }> = [
      { key: "site", col: "achados_site" },
      { key: "google_maps", col: "achados_maps" },
      { key: "instagram", col: "achados_instagram" },
      { key: "doctoralia", col: "achados_doctoralia" },
      { key: "reclame_aqui", col: "achados_reclame_aqui" },
    ];
    for (const { key, col } of fontesAchados) {
      const a = diag[col];
      if (a?.problemas) {
        for (const p of a.problemas) {
          if (p.severidade === "alta") {
            achadosCompactos.push(`[${key}] ❌ ${p.texto}`);
          }
        }
      }
    }

    const oportunidadeTop = (diag.oportunidades || []).find((o: any) => o.prioridade === "alta") || (diag.oportunidades || [])[0];

    const channelLabel =
      canal === "whatsapp" ? "WhatsApp" : canal === "instagram_dm" ? "DM do Instagram" : "Email";
    const channelLimits =
      canal === "instagram_dm"
        ? "máx 600 chars (IG limita DM longo)"
        : "máx 800 chars (WhatsApp/email)";

    const systemPrompt = `Você é um SDR consultivo que vende soluções de IA pra empresas.
Tom: **Frank Costa** — direto, sem floreio, em minúsculas, sem travessão.

REGRAS DE TOM:
- Português BR coloquial
- Curto, sem formalidade
- "Vc" em vez de "você" quando couber
- Sem "Olá," "Oi," vazio. Vai direto.
- 1 quebra de linha entre parágrafos curtos
- Termina com pergunta ou CTA leve
- Sem usar emoji em excesso (máx 1-2 estratégicos)
- NÃO menciona "diagnóstico" / "análise" sem deixar claro o valor
- Mostra que VOCÊ olhou o negócio dele (cita 1-2 problemas reais)
- Oferece um gancho pra continuar a conversa

REGRAS DE ESTRUTURA:
1. Linha 1: gancho personalizado (cita o nome ou tipo do negócio)
2. Linhas 2-4: o que VOCÊ achou de problema específico (1-2 dores reais)
3. Linha final: oferta leve ("posso te mandar...", "quer ver?", "rola eu te mostrar?")

LIMITES:
- ${channelLimits}
- NÃO inclui link no corpo da msg (será adicionado depois)
- NÃO usa lista bullet — só texto corrido
- VARIANTE ${variant}: ${variant === 0 ? "padrão" : variant === 1 ? "mais provocador" : "mais empático/curioso"}

CONTEXTO DO LEAD:
Nome: ${lead?.nome || "Lead"}
Tipo: ${lead?.categoria || "negócio"}
Local: ${lead?.cidade || ""}${lead?.uf ? `/${lead.uf}` : ""}
Score Geral: ${diag.score_geral}/10
Achados críticos:
${achadosCompactos.slice(0, 5).join("\n") || "(sem achados críticos)"}

Oportunidade #1 que IA resolveria: ${oportunidadeTop?.titulo || "automação geral"}
Por quê: ${oportunidadeTop?.descricao || ""}

CANAL DE ENVIO: ${channelLabel}

RETORNE APENAS JSON:
{
  "mensagem": "texto da mensagem aqui (sem aspas internas, escape aspas)",
  "gancho_principal": "1 linha resumindo a dor principal usada",
  "warnings": ["se algum"]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.6 + variant * 0.15, responseMimeType: "application/json" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return json({ error: "Falha Gemini", detalhes: errText }, 500);
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { mensagem: raw, gancho_principal: "", warnings: ["JSON parse falhou"] };
    }

    return json({
      mensagem: parsed.mensagem || "",
      gancho_principal: parsed.gancho_principal || "",
      warnings: parsed.warnings || [],
      diagnostico_id,
      lead_nome: lead?.nome,
      lead_telefone: lead?.telefone,
      lead_instagram: lead?.instagram_handle,
    });
  } catch (e) {
    console.error("[gerar-mensagem]", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
