// Reclame Aqui — busca empresa + raspa página com reclamações textuais
// + Gemini analisa sentimento e temas frequentes

const FIRECRAWL_BASE = "https://api.firecrawl.dev";
const GEMINI_MODEL = "gemini-2.5-flash";

import type { FonteResult } from "./site.ts";
import { loadPrompt } from "../load_prompt.ts";
import { integrationKeys } from "../keys.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function analisarReclameAqui(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  if (!lead.nome) {
    return {
      fonte: "reclame_aqui",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem nome",
    };
  }

  const query = encodeURIComponent(lead.nome);
  const buscaUrl = `https://www.reclameaqui.com.br/busca/?q=${query}`;

  try {
    // Etapa 1: busca pelo nome — tenta encontrar slug/URL da empresa
    const buscaRes = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: buscaUrl, formats: ["markdown", "html"], waitFor: 2500 }),
    });

    if (!buscaRes.ok) {
      return {
        fonte: "reclame_aqui",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: `Firecrawl HTTP ${buscaRes.status}`,
      };
    }

    const buscaData = await buscaRes.json();
    const md = (buscaData?.data?.markdown || "") as string;
    const html = (buscaData?.data?.html || "") as string;
    const fullText = (md + " " + html);

    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    const naoEncontrado =
      /não encontramos|sem resultados|0 empresas|nenhuma empresa/i.test(md) || md.length < 600;

    if (naoEncontrado) {
      positivos.push({ texto: "Sem registro no Reclame Aqui (zero reclamações públicas)" });
      return {
        fonte: "reclame_aqui",
        ok: true,
        score: 8,
        achados: { problemas, atencao, positivos, metricas: { encontrado: false } },
        custo: 0.015,
        duracao_ms: Date.now() - t0,
      };
    }

    // Encontra TODOS os slugs de empresa na página
    const slugMatches = [...fullText.matchAll(/reclameaqui\.com\.br\/empresa\/([a-z0-9-]+)/gi)];
    let custoTotal = 0.015;

    // Valida: pelo menos UM slug bate com o nome do lead?
    const nomeNorm = normalize(lead.nome);
    const nomeTokens = nomeNorm.split(/\s+/).filter((t) => t.length > 3);

    const empresaSlugMatch = slugMatches.find((m) => {
      const slug = m[1];
      // Slug bate se contém algum token significativo do nome
      return nomeTokens.some((t) => slug.includes(t));
    });

    // Se NÃO achou slug que bata com o nome → tratamos como NÃO encontrado.
    if (!empresaSlugMatch) {
      positivos.push({ texto: "Sem registro específico no Reclame Aqui (zero reclamações públicas)" });
      return {
        fonte: "reclame_aqui",
        ok: true,
        score: 8,
        achados: {
          problemas,
          atencao,
          positivos,
          metricas: {
            encontrado: false,
            slugs_encontrados_na_pagina: slugMatches.length,
            nota: "Slugs achados não casam com o nome do lead",
          },
        },
        custo: custoTotal,
        duracao_ms: Date.now() - t0,
      };
    }

    let totalReclamacoes: number | null = null;
    let indiceSolucao: number | null = null;
    let reputacao: string | null = null;
    let reclamacoesTexto: string[] = [];
    let aiInsights: any = null;

    // Sigamos pra detalhes da empresa
    if (true) {
      const empresaUrl = `https://www.reclameaqui.com.br/empresa/${empresaSlugMatch[1]}/`;
      try {
        const empRes = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: empresaUrl, formats: ["markdown"], waitFor: 3500 }),
        });
        if (empRes.ok) {
          const empData = await empRes.json();
          const empMd = (empData?.data?.markdown || "") as string;
          custoTotal += 0.015;

          // Tenta extrair reclamações (geralmente aparecem como tópicos com título + texto)
          // Pattern básico: linhas curtas que parecem títulos de reclamação
          const linhas = empMd
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 30 && l.length < 250 && !l.startsWith("#") && !l.startsWith("*"));
          reclamacoesTexto = linhas.slice(0, 20);

          // Re-extrai métricas com mais precisão
          const t2 = empMd.match(/(\d+)\s*reclama(?:ç|c)/i);
          if (t2) totalReclamacoes = parseInt(t2[1], 10);
          const i2 = empMd.match(/índice de solução[^\d]*(\d{1,3}[,.]?\d?)\s*%/i);
          if (i2) indiceSolucao = parseFloat(i2[1].replace(",", "."));
        }
      } catch (e) {
        // sem reclamações textuais é ok — segue
      }

      // Etapa 3: Gemini analisa sentimento + temas das reclamações
      const GEMINI_API_KEY = integrationKeys.GEMINI_API_KEY;
      if (GEMINI_API_KEY && reclamacoesTexto.length >= 3) {
        aiInsights = await analisarSentimentoReclamacoes(
          lead.nome,
          reclamacoesTexto,
          GEMINI_API_KEY
        );
        custoTotal += 0.001;
      }
    }

    // Achados
    if (totalReclamacoes !== null) {
      if (totalReclamacoes > 100) {
        problemas.push({
          texto: `${totalReclamacoes} reclamações no Reclame Aqui — alto volume`,
          severidade: "alta",
        });
      } else if (totalReclamacoes > 30) {
        problemas.push({
          texto: `${totalReclamacoes} reclamações no Reclame Aqui`,
          severidade: "media",
        });
      } else if (totalReclamacoes > 5) {
        atencao.push({ texto: `${totalReclamacoes} reclamações registradas` });
      }
    }

    if (indiceSolucao !== null) {
      if (indiceSolucao < 50) {
        problemas.push({
          texto: `Só ${indiceSolucao.toFixed(0)}% das reclamações resolvidas`,
          severidade: "alta",
        });
      } else if (indiceSolucao >= 80) {
        positivos.push({ texto: `${indiceSolucao.toFixed(0)}% de solução — bom atendimento` });
      }
    }

    if (reputacao && /ruim|péssima|pessima/i.test(reputacao)) {
      problemas.push({ texto: `Reputação "${reputacao}" no Reclame Aqui`, severidade: "alta" });
    } else if (reputacao && /(ótim|otim|excelente|bom)/i.test(reputacao)) {
      positivos.push({ texto: `Reputação "${reputacao}"` });
    }

    if (aiInsights?.temas_recorrentes?.length) {
      atencao.push({
        texto: `Temas recorrentes nas reclamações: ${aiInsights.temas_recorrentes.slice(0, 3).join(", ")}`,
      });
    }
    if (aiInsights?.sentimento_geral) {
      atencao.push({ texto: `Sentimento geral: ${aiInsights.sentimento_geral}` });
    }

    // Score
    const penaltyAlta = problemas.filter((p) => p.severidade === "alta").length * 1.8;
    const penaltyMedia = problemas.filter((p) => p.severidade === "media").length * 0.9;
    const penaltyAtencao = atencao.length * 0.3;
    const bonus = Math.min(positivos.length * 0.6, 2.5);
    const score = Math.max(0, Math.min(10, 6 - penaltyAlta - penaltyMedia - penaltyAtencao + bonus));

    return {
      fonte: "reclame_aqui",
      ok: true,
      score: Math.round(score),
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: {
          encontrado: true,
          totalReclamacoes,
          indiceSolucao,
          reputacao,
          reclamacoes_amostra: reclamacoesTexto.slice(0, 5),
          ai_temas: aiInsights?.temas_recorrentes,
          ai_sentimento: aiInsights?.sentimento_geral,
          ai_dor_principal: aiInsights?.dor_principal,
          ai_padrao: aiInsights?.padrao_atendimento,
        },
      },
      custo: custoTotal,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "reclame_aqui",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function analisarSentimentoReclamacoes(
  nome: string,
  reclamacoes: string[],
  geminiKey: string
) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const cfg = await loadPrompt(supabase, "ra_sentimento", {
    nome,
    reclamacoes_lista: reclamacoes.map((r, i) => `${i + 1}. ${r}`).join("\n"),
  }, {
    prompt_text: `Analise as reclamações de "${nome}" e retorne JSON com sentimento_geral, temas_recorrentes, dor_principal, padrao_atendimento.`,
    ai_model: GEMINI_MODEL,
    temperature: 0.2,
  });
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.ai_model}:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: cfg.prompt_text }] }],
        generationConfig: { temperature: cfg.temperature, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
  } catch {
    return null;
  }
}
