// iFood — busca o nome do restaurante no iFood

const FIRECRAWL_BASE = "https://api.firecrawl.dev";

import type { FonteResult } from "./site.ts";

export async function analisarIfood(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  if (!lead.nome) {
    return {
      fonte: "ifood",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem nome",
    };
  }

  // iFood não tem URL pública estável de busca. Usa Google search com site:ifood.com.br
  const query = encodeURIComponent(`site:ifood.com.br ${lead.nome}${lead.cidade ? " " + lead.cidade : ""}`);
  const url = `https://www.google.com/search?q=${query}`;

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], waitFor: 2000 }),
    });

    if (!res.ok) {
      return {
        fonte: "ifood",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: `Firecrawl HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const md = (data?.data?.markdown || "") as string;

    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    const naoEncontrado = !/ifood\.com\.br/i.test(md);

    if (naoEncontrado) {
      problemas.push({
        texto: "Não está no iFood — perde 80% do delivery na cidade",
        severidade: "alta",
      });
      return {
        fonte: "ifood",
        ok: true,
        score: 2,
        achados: { problemas, atencao, positivos, metricas: { encontrado: false } },
        custo: 0.015,
        duracao_ms: Date.now() - t0,
      };
    }

    positivos.push({ texto: "Restaurante presente no iFood" });

    // Tenta detectar nota
    const notaMatch = md.match(/(\d[,.]\d)\s*(?:\(|⭐|estrelas|de 5)/i);
    const nota = notaMatch ? parseFloat(notaMatch[1].replace(",", ".")) : null;

    if (nota !== null) {
      if (nota < 4.0) {
        problemas.push({ texto: `iFood ${nota.toFixed(1)} — nota baixa`, severidade: "alta" });
      } else if (nota < 4.6) {
        atencao.push({ texto: `iFood ${nota.toFixed(1)} — abaixo da média` });
      } else {
        positivos.push({ texto: `${nota.toFixed(1)} no iFood` });
      }
    }

    const penaltyAlta = problemas.filter((p) => p.severidade === "alta").length * 2.0;
    const penaltyMedia = problemas.filter((p) => p.severidade === "media").length * 1.0;
    const penaltyAtencao = atencao.length * 0.4;
    const bonus = Math.min(positivos.length * 0.5, 2.0);

    const score = Math.max(0, Math.min(10, 6 - penaltyAlta - penaltyMedia - penaltyAtencao + bonus));

    return {
      fonte: "ifood",
      ok: true,
      score: Math.round(score),
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: { encontrado: true, nota },
      },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "ifood",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}
