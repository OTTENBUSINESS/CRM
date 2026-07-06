// Contexto de Negócio — A FONTE MAIS IMPORTANTE
// Lê o site + Gemini estrutura: o que vende, posicionamento, persona, preço, diferenciais
// Esse output enriquece TODAS as outras fontes (Meta Ads usa produtos reais, etc)

import type { FonteResult } from "./site.ts";
import { loadPrompt } from "../load_prompt.ts";
import { integrationKeys } from "../keys.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FIRECRAWL_BASE = "https://api.firecrawl.dev";
const GEMINI_MODEL = "gemini-2.5-flash";

export async function analisarContextoNegocio(
  lead: any,
  fcKey: string
): Promise<FonteResult> {
  const t0 = Date.now();
  const GEMINI_API_KEY = integrationKeys.GEMINI_API_KEY;

  if (!lead.url_site) {
    return {
      fonte: "contexto_negocio",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem site pra extrair contexto",
    };
  }

  if (!GEMINI_API_KEY) {
    return {
      fonte: "contexto_negocio",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      erro: "GEMINI_API_KEY não configurada",
    };
  }

  let custo = 0;

  try {
    // 1. Scrape do site
    const fcRes = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: lead.url_site, formats: ["markdown"], waitFor: 2500 }),
    });
    if (!fcRes.ok) {
      return {
        fonte: "contexto_negocio",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: `Firecrawl HTTP ${fcRes.status}`,
      };
    }
    const fcData = await fcRes.json();
    const md = (fcData?.data?.markdown || "") as string;
    const meta = (fcData?.data?.metadata || {}) as Record<string, any>;
    custo += 0.015;

    if (md.length < 200) {
      return {
        fonte: "contexto_negocio",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo,
        duracao_ms: Date.now() - t0,
        erro: "Markdown muito curto pra extrair contexto",
      };
    }

    // 2. Gemini estrutura o negócio
    // Cap markdown em 12k chars pra controlar custo
    const mdCapped = md.slice(0, 12000);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const cfg = await loadPrompt(supabase, "contexto_negocio", {
      url: lead.url_site,
      title: meta.title || "",
      description: meta.description || "",
      markdown: mdCapped,
    }, {
      prompt_text: "Analise o site e retorne JSON com tipo_negocio, segmento, produtos_servicos, precos, posicionamento, publico_alvo, modelo_receita, diferenciais, palavras_chave_seo, sinal_de_dor_mais_obvio.",
      ai_model: GEMINI_MODEL,
      temperature: 0.2,
    });


    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.ai_model}:generateContent?key=${GEMINI_API_KEY}`;
    const gRes = await fetch(url, {
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

    if (!gRes.ok) {
      const errText = await gRes.text();
      return {
        fonte: "contexto_negocio",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo,
        duracao_ms: Date.now() - t0,
        erro: `Gemini HTTP ${gRes.status}: ${errText.slice(0, 200)}`,
      };
    }

    const gData = await gRes.json();
    const raw = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    custo += 0.002;

    let dossie: any;
    try {
      dossie = JSON.parse(raw);
    } catch {
      dossie = {};
    }

    // Achados — sumariza o dossiê pra UI mostrar
    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    if (dossie.tipo_negocio) {
      positivos.push({ texto: `Negócio identificado: ${dossie.tipo_negocio}` });
    }
    if (dossie.posicionamento) {
      positivos.push({ texto: `Posicionamento: "${String(dossie.posicionamento).slice(0, 120)}"` });
    }
    if (dossie.publico_alvo) {
      positivos.push({ texto: `Público-alvo: "${String(dossie.publico_alvo).slice(0, 120)}"` });
    }
    if (Array.isArray(dossie.produtos_servicos) && dossie.produtos_servicos.length > 0) {
      positivos.push({
        texto: `${dossie.produtos_servicos.length} produtos/serviços identificados`,
      });
    }
    if (dossie.precos?.faixa_visivel === "sem preço visível") {
      atencao.push({
        texto: "Site não mostra preço — atrito na decisão de compra",
      });
    } else if (dossie.precos?.faixa_visivel) {
      positivos.push({ texto: `Preços visíveis: ${dossie.precos.faixa_visivel}` });
    }

    return {
      fonte: "contexto_negocio",
      ok: true,
      score: 7, // contexto não é score de qualidade — é fato neutro
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: dossie,
      },
      custo,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "contexto_negocio",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}
