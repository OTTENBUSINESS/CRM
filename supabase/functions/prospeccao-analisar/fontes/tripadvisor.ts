// TripAdvisor — busca pelo nome
const FIRECRAWL_BASE = "https://api.firecrawl.dev";
import type { FonteResult } from "./site.ts";

export async function analisarTripadvisor(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  if (!lead.nome) {
    return {
      fonte: "tripadvisor",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem nome",
    };
  }
  const query = encodeURIComponent(`site:tripadvisor.com.br ${lead.nome}${lead.cidade ? " " + lead.cidade : ""}`);
  const url = `https://www.google.com/search?q=${query}`;

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], waitFor: 2000 }),
    });
    if (!res.ok) {
      return {
        fonte: "tripadvisor",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const md = (data?.data?.markdown || "") as string;

    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    if (!/tripadvisor\./i.test(md)) {
      atencao.push({ texto: "Não está no TripAdvisor — perde turistas" });
      return {
        fonte: "tripadvisor",
        ok: true,
        score: 4,
        achados: { problemas, atencao, positivos, metricas: { encontrado: false } },
        custo: 0.015,
        duracao_ms: Date.now() - t0,
      };
    }

    positivos.push({ texto: "Listado no TripAdvisor" });
    const notaMatch = md.match(/(\d[,.]\d)\s*(?:de 5|\/5|⭐)/i);
    const nota = notaMatch ? parseFloat(notaMatch[1].replace(",", ".")) : null;
    if (nota !== null) {
      if (nota < 3.5) problemas.push({ texto: `Nota TripAdvisor ${nota.toFixed(1)} — baixa`, severidade: "alta" });
      else if (nota >= 4.5) positivos.push({ texto: `${nota.toFixed(1)} no TripAdvisor` });
    }

    const score = Math.max(
      0,
      Math.min(
        10,
        6 +
          Math.min(positivos.length * 0.5, 2.0) -
          problemas.filter((p) => p.severidade === "alta").length * 2 -
          atencao.length * 0.4
      )
    );
    return {
      fonte: "tripadvisor",
      ok: true,
      score: Math.round(score),
      achados: { problemas, atencao, positivos, metricas: { encontrado: true, nota } },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "tripadvisor",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}
