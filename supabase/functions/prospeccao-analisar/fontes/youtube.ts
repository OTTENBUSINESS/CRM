// YouTube — raspa /@handle ou /channel/X (precisa URL ou handle)

const FIRECRAWL_BASE = "https://api.firecrawl.dev";

import type { FonteResult } from "./site.ts";

export async function analisarYoutube(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();

  let url = lead.youtube_url;
  if (!url && lead.raw_data?.original?.url_site) {
    const m = String(lead.raw_data.original.url_site).match(
      /youtube\.com\/(?:@[a-z0-9_-]+|channel\/[a-z0-9_-]+|c\/[a-z0-9_-]+)/i
    );
    if (m) url = `https://www.${m[0]}`;
  }

  if (!url) {
    return {
      fonte: "youtube",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem canal YouTube",
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
        fonte: "youtube",
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

    const subsMatch =
      md.match(/([\d,.]+\s*(?:mil|k|mi|m)?)\s*(?:inscritos|subscribers)/i) ||
      meta.description?.match(/([\d,.]+\s*(?:mil|k|mi|m)?)\s*(?:inscritos|subscribers)/i);
    const subs = parseLargeNum(subsMatch?.[1]);

    const videosMatch = md.match(/([\d,.]+\s*(?:mil|k)?)\s*(?:vídeos|videos)/i);
    const videos = parseLargeNum(videosMatch?.[1]);

    if (subs !== null) {
      if (subs < 100) {
        problemas.push({
          texto: `Só ${subs} inscritos no YouTube — canal abandonado`,
          severidade: "alta",
        });
      } else if (subs < 1000) {
        atencao.push({ texto: `${subs} inscritos — canal pequeno` });
      } else if (subs > 10000) {
        positivos.push({ texto: `${subs.toLocaleString("pt-BR")} inscritos no YouTube` });
      }
    } else {
      atencao.push({ texto: "Não consegui ler inscritos do YouTube" });
    }

    if (videos !== null) {
      if (videos < 5) atencao.push({ texto: `Só ${videos} vídeos publicados` });
      else if (videos > 50) positivos.push({ texto: `${videos} vídeos no canal` });
    }

    // Frequência (tem post recente?)
    const recente = /há\s*(\d+)\s*(?:dia|semana|hora)/i.test(md);
    if (!recente) {
      atencao.push({ texto: "Sem upload recente — canal estagnado" });
    }

    // Shorts
    if (md.toLowerCase().includes("shorts") || md.includes("/shorts/")) {
      positivos.push({ texto: "Tem Shorts (formato com mais alcance)" });
    }

    const penaltyAlta = problemas.filter((p) => p.severidade === "alta").length * 2.0;
    const penaltyMedia = problemas.filter((p) => p.severidade === "media").length * 1.0;
    const penaltyAtencao = atencao.length * 0.4;
    const bonus = Math.min(positivos.length * 0.5, 2.0);

    const score = Math.max(0, Math.min(10, 5 - penaltyAlta - penaltyMedia - penaltyAtencao + bonus));

    return {
      fonte: "youtube",
      ok: true,
      score: Math.round(score),
      achados: { problemas, atencao, positivos, metricas: { subs, videos } },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "youtube",
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
