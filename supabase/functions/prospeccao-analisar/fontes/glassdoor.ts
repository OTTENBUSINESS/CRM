// Glassdoor — busca pela empresa
const FIRECRAWL_BASE = "https://api.firecrawl.dev";
import type { FonteResult } from "./site.ts";

export async function analisarGlassdoor(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  if (!lead.nome) {
    return {
      fonte: "glassdoor",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem nome",
    };
  }
  const query = encodeURIComponent(`site:glassdoor.com.br ${lead.nome}`);
  const url = `https://www.google.com/search?q=${query}`;

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], waitFor: 2000 }),
    });
    if (!res.ok)
      return {
        fonte: "glassdoor",
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

    if (!/glassdoor/i.test(md)) {
      atencao.push({ texto: "Não está no Glassdoor — afeta atração de talentos B2B" });
      return {
        fonte: "glassdoor",
        ok: true,
        score: 5,
        achados: { problemas, atencao, positivos, metricas: { encontrado: false } },
        custo: 0.015,
        duracao_ms: Date.now() - t0,
      };
    }

    const notaMatch = md.match(/(\d[,.]\d)\s*(?:de 5|\/5|⭐|estrelas)/i);
    const nota = notaMatch ? parseFloat(notaMatch[1].replace(",", ".")) : null;

    if (nota !== null) {
      if (nota < 3.0) {
        problemas.push({ texto: `Glassdoor ${nota.toFixed(1)} — clima ruim afasta talentos`, severidade: "alta" });
      } else if (nota < 3.8) {
        atencao.push({ texto: `Glassdoor ${nota.toFixed(1)} — abaixo da média` });
      } else if (nota >= 4.2) {
        positivos.push({ texto: `${nota.toFixed(1)} no Glassdoor — boa marca empregadora` });
      }
    }

    const score = Math.max(
      0,
      Math.min(
        10,
        5 +
          (nota !== null ? Math.max(0, (nota - 2.5) * 1.5) : 0) -
          problemas.filter((p) => p.severidade === "alta").length * 2 -
          atencao.length * 0.5 +
          Math.min(positivos.length * 0.5, 1.5)
      )
    );

    return {
      fonte: "glassdoor",
      ok: true,
      score: Math.round(score),
      achados: { problemas, atencao, positivos, metricas: { encontrado: true, nota } },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "glassdoor",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}
