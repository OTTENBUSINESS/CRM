// Google Ads Transparency — anúncios Search/Display ativos

import type { FonteResult } from "./site.ts";
import { integrationKeys } from "../keys.ts";

const SC_BASE = "https://api.scrapecreators.com";
const FC_BASE = "https://api.firecrawl.dev";

export async function analisarGoogleAds(lead: any, firecrawlKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  const SC_KEY = integrationKeys.SCRAPECREATORS_API_KEY;

  const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
  const atencao: { texto: string }[] = [];
  const positivos: { texto: string }[] = [];
  const metricas: Record<string, unknown> = { fonte_dados: "" };

  let adsAtivos = 0;
  let formatos: string[] = [];
  let custo = 0;
  let erro: string | null = null;

  const dominio = lead.url_site
    ? safeHost(lead.url_site)
    : null;
  const query = dominio || lead.nome;

  // ===== 1. ScrapeCreators =====
  if (SC_KEY) {
    try {
      const url = `${SC_BASE}/v1/google/adLibrary/search?query=${encodeURIComponent(query)}&region=BR`;
      const res = await fetch(url, { headers: { "x-api-key": SC_KEY } });
      if (res.ok) {
        const data = await res.json();
        // Shape ScrapeCreators padrão: searchResults + searchResultsCount
        const totalCount = data?.searchResultsCount || 0;
        const ads = data?.searchResults || data?.results || [];
        adsAtivos = totalCount;
        const formatosSet = new Set<string>();
        for (const a of ads as any[]) {
          if (a.format || a.ad_format) formatosSet.add(a.format || a.ad_format);
        }
        formatos = Array.from(formatosSet);
        custo = 0.01;
        metricas.fonte_dados = "ScrapeCreators";
      } else {
        erro = `SC HTTP ${res.status}`;
      }
    } catch (e) {
      erro = `SC erro: ${String(e)}`;
    }
  }

  // ===== 2. Fallback Firecrawl =====
  if (metricas.fonte_dados === "" && firecrawlKey && dominio) {
    try {
      const url = `https://adstransparency.google.com/?region=BR&domain=${dominio}`;
      const res = await fetch(`${FC_BASE}/v1/scrape`, {
        method: "POST",
        headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], waitFor: 3500 }),
      });
      if (res.ok) {
        const j = await res.json();
        const md = j?.data?.markdown || "";
        if (/no ads|sem anúncios|0 ads/i.test(md)) {
          adsAtivos = 0;
        } else {
          const m = md.match(/(\d+)\s*(?:ads|anúncios|results)/i);
          adsAtivos = m ? parseInt(m[1], 10) : 0;
        }
        custo = 0.015;
        metricas.fonte_dados = "Firecrawl";
      } else {
        erro = `FC HTTP ${res.status}`;
      }
    } catch (e) {
      erro = `FC erro: ${String(e)}`;
    }
  }

  metricas.ads_ativos = adsAtivos;
  metricas.formatos = formatos;
  metricas.dominio_pesquisado = dominio;

  if (metricas.fonte_dados === "") {
    return {
      fonte: "google_ads",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: erro || "Nenhuma fonte disponível",
    };
  }

  if (adsAtivos === 0) {
    problemas.push({
      texto: "Sem Google Ads ativo — perde alcance em busca por intenção de compra",
      severidade: "alta",
    });
  } else if (adsAtivos < 3) {
    atencao.push({ texto: `${adsAtivos} ad${adsAtivos > 1 ? "s" : ""} no Google — operação iniciante` });
  } else {
    positivos.push({ texto: `${adsAtivos} ads ativos no Google` });
  }

  if (formatos.length > 0) {
    positivos.push({ texto: `Formatos: ${formatos.join(", ")}` });
  }

  let score = 5;
  if (adsAtivos === 0) score = 2;
  else if (adsAtivos < 3) score = 5;
  else if (adsAtivos < 10) score = 7;
  else score = 9;

  return {
    fonte: "google_ads",
    ok: true,
    score,
    achados: { problemas, atencao, positivos, metricas },
    custo,
    duracao_ms: Date.now() - t0,
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
