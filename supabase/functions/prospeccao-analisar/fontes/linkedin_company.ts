// LinkedIn empresa — raspa /company/X (precisa de URL)

const FIRECRAWL_BASE = "https://api.firecrawl.dev";

import type { FonteResult } from "./site.ts";

export async function analisarLinkedinCompany(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();

  let url = lead.linkedin_url;
  if (!url && lead.raw_data?.original?.url_site) {
    const m = String(lead.raw_data.original.url_site).match(/linkedin\.com\/company\/[a-z0-9-]+/i);
    if (m) url = `https://www.${m[0]}`;
  }

  if (!url) {
    return {
      fonte: "linkedin_company",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem URL LinkedIn da empresa",
    };
  }

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], waitFor: 3000 }),
    });

    if (!res.ok) {
      return {
        fonte: "linkedin_company",
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
    const meta = (data?.data?.metadata || {}) as Record<string, any>;

    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    const employeesMatch = md.match(/([\d,.]+\s*(?:k|m)?)\s*(?:funcion(?:á|a)rios|employees|funciona)/i);
    const employees = parseLargeNum(employeesMatch?.[1]);

    const followersMatch = md.match(/([\d,.]+\s*(?:k|m)?)\s*(?:seguidores|followers)/i);
    const followers = parseLargeNum(followersMatch?.[1]);

    const industryMatch = md.match(/(?:setor|industry)[\s:]*([a-záéíóúãõ\s/]+?)(?:\n|·)/i);
    const industry = industryMatch ? industryMatch[1].trim() : null;

    const fundadaMatch = md.match(/(?:fundada|founded)[\s:]*(\d{4})/i);
    const fundada = fundadaMatch ? parseInt(fundadaMatch[1], 10) : null;

    if (employees !== null) {
      if (employees < 5) {
        atencao.push({ texto: `Só ${employees} funcionários listados — empresa pequena/recente` });
      } else if (employees > 50) {
        positivos.push({ texto: `${employees}+ funcionários — empresa estabelecida` });
      }
    } else {
      atencao.push({ texto: "Não consegui ler tamanho da empresa no LinkedIn" });
    }

    if (followers !== null) {
      if (followers < 500) {
        problemas.push({
          texto: `Só ${followers} seguidores no LinkedIn — pouca presença B2B`,
          severidade: "media",
        });
      } else if (followers > 5000) {
        positivos.push({ texto: `${followers.toLocaleString("pt-BR")} seguidores no LinkedIn` });
      }
    }

    // Posts recentes
    const temPostRecente = /há\s*(\d+)\s*(?:dia|hora|semana)/i.test(md);
    if (!temPostRecente) {
      atencao.push({ texto: "Sem posts recentes — perfil estagnado" });
    }

    if (!meta.description && !md.includes("sobre nós") && !md.includes("about us")) {
      atencao.push({ texto: "Sem descrição/sobre na página LinkedIn" });
    }

    const penaltyAlta = problemas.filter((p) => p.severidade === "alta").length * 2.0;
    const penaltyMedia = problemas.filter((p) => p.severidade === "media").length * 1.0;
    const penaltyAtencao = atencao.length * 0.4;
    const bonus = Math.min(positivos.length * 0.5, 2.0);

    const score = Math.max(0, Math.min(10, 6 - penaltyAlta - penaltyMedia - penaltyAtencao + bonus));

    return {
      fonte: "linkedin_company",
      ok: true,
      score: Math.round(score),
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: { employees, followers, industry, fundada },
      },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "linkedin_company",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}

function parseLargeNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (s.includes("k") || s.includes("mil")) return Math.round(n * 1000);
  if (s.includes("m") || s.includes("mi")) return Math.round(n * 1_000_000);
  return Math.round(n);
}
