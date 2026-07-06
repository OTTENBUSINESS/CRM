// Posição Google — busca "[nicho/tipo] [cidade]" e vê em que posição o lead aparece
// Usa Firecrawl /search

import type { FonteResult } from "./site.ts";

const FC_BASE = "https://api.firecrawl.dev";

export async function analisarPosicaoGoogle(lead: any, firecrawlKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  if (!lead.nome) {
    return {
      fonte: "posicao_google",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem nome",
    };
  }

  // Decide query:
  // - Se tem categoria + cidade: "[categoria] [cidade]" (busca local)
  // - Senão: usa nome do lead (busca pessoal/marca)
  const temCategoriaReal =
    lead.categoria &&
    lead.categoria.length > 4 &&
    !/(?:negócio|negocio|empresa|comércio|comercio|loja|servico|serviço)/i.test(lead.categoria);

  let localQuery: string;
  if (temCategoriaReal && lead.cidade) {
    localQuery = `${lead.categoria} ${lead.cidade}`;
  } else if (lead.nome.startsWith("@") || /^https?:\/\//i.test(lead.nome)) {
    // modo direto IG/site sem dados — não tem como buscar com sentido
    return {
      fonte: "posicao_google",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem categoria/cidade pra busca local com sentido",
    };
  } else {
    localQuery = lead.cidade ? `${lead.nome} ${lead.cidade}` : lead.nome;
  }

  const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
  const atencao: { texto: string }[] = [];
  const positivos: { texto: string }[] = [];

  try {
    const res = await fetch(`${FC_BASE}/v1/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: localQuery, limit: 20 }),
    });

    if (!res.ok) {
      return {
        fonte: "posicao_google",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: `Firecrawl HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const results: any[] = data?.data || data?.results || [];

    // Procura o lead nos resultados
    const dominio = lead.url_site ? safeHost(lead.url_site) : null;
    const nomeLower = lead.nome.toLowerCase();

    let posicao: number | null = null;
    const concorrentes: any[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const rUrl = (r.url || r.link || "").toLowerCase();
      const rTitle = (r.title || "").toLowerCase();

      const matchDominio = dominio && rUrl.includes(dominio);
      const matchNome = rTitle.includes(nomeLower) || rUrl.includes(nomeLower.replace(/\s+/g, "-"));

      if (matchDominio || matchNome) {
        if (posicao === null) posicao = i + 1;
      } else {
        // Considera concorrente
        if (concorrentes.length < 5) {
          let concHost: string | null = null;
          try {
            concHost = new URL(r.url || r.link || "").hostname.replace(/^www\./, "");
          } catch {
            concHost = r.url || r.link;
          }
          concorrentes.push({
            posicao: i + 1,
            titulo: r.title,
            url: r.url || r.link,
            host: concHost,
          });
        }
      }
    }

    const metricas = {
      query: localQuery,
      total_resultados: results.length,
      posicao_lead: posicao,
      concorrentes_top5: concorrentes,
    };

    if (posicao === null) {
      problemas.push({
        texto: `Não aparece nos top 20 do Google pra "${localQuery}" — invisível em busca local`,
        severidade: "alta",
      });
    } else if (posicao > 10) {
      problemas.push({
        texto: `Aparece só na posição ${posicao} pra "${localQuery}" (página 2+ do Google)`,
        severidade: "media",
      });
    } else if (posicao > 3) {
      atencao.push({ texto: `Posição ${posicao} no Google — bom mas pode subir pro top 3` });
    } else {
      positivos.push({ texto: `Top ${posicao} no Google pra "${localQuery}"` });
    }

    if (concorrentes.length > 0) {
      positivos.push({
        texto: `Top concorrentes na busca: ${concorrentes
          .slice(0, 3)
          .map((c) => c.host)
          .join(", ")}`,
      });
    }

    let score = 5;
    if (posicao === null) score = 2;
    else if (posicao > 10) score = 4;
    else if (posicao > 5) score = 6;
    else if (posicao > 3) score = 7;
    else score = 9;

    return {
      fonte: "posicao_google",
      ok: true,
      score,
      achados: { problemas, atencao, positivos, metricas },
      custo: 0.005,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "posicao_google",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
