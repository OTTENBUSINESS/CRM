// Mercado Livre — busca lojas oficiais ou produtos do lead
const FIRECRAWL_BASE = "https://api.firecrawl.dev";
import type { FonteResult } from "./site.ts";

export async function analisarMercadoLivre(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  if (!lead.nome) {
    return {
      fonte: "mercado_livre",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem nome",
    };
  }
  const query = encodeURIComponent(`site:mercadolivre.com.br ${lead.nome}`);
  const url = `https://www.google.com/search?q=${query}`;

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], waitFor: 2000 }),
    });
    if (!res.ok)
      return {
        fonte: "mercado_livre",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: `HTTP ${res.status}`,
      };
    const data = await res.json();
    const md = (data?.data?.markdown || "") as string;

    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    if (!/mercadolivre\./i.test(md)) {
      problemas.push({
        texto: "Não vende no Mercado Livre — perde marketplace #1 do Brasil",
        severidade: "alta",
      });
      return {
        fonte: "mercado_livre",
        ok: true,
        score: 3,
        achados: { problemas, atencao, positivos, metricas: { encontrado: false } },
        custo: 0.015,
        duracao_ms: Date.now() - t0,
      };
    }

    positivos.push({ texto: "Vende no Mercado Livre" });

    if (/MercadoL(ider|íder)|loja oficial/i.test(md)) {
      positivos.push({ texto: "Status MercadoLíder ou Loja Oficial" });
    }

    const score = Math.max(0, Math.min(10, 6 + Math.min(positivos.length * 0.7, 2.5)));
    return {
      fonte: "mercado_livre",
      ok: true,
      score: Math.round(score),
      achados: { problemas, atencao, positivos, metricas: { encontrado: true } },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "mercado_livre",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}
