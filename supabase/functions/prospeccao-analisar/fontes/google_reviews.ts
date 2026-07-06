// Google Reviews — atalho que reusa dados já capturados pelo Maps
// (não vai fazer scrape novo, só re-avalia em cima do que tem)
import type { FonteResult } from "./site.ts";

export async function analisarGoogleReviews(lead: any, _apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  const nota = lead.nota_google;
  const reviews = lead.qtd_avaliacoes || 0;

  if (nota === null || nota === undefined) {
    return {
      fonte: "google_reviews",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      skipped: "lead sem nota Google",
    };
  }

  const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
  const atencao: { texto: string }[] = [];
  const positivos: { texto: string }[] = [];

  if (reviews === 0) {
    problemas.push({ texto: "Zero reviews — invisível na busca local", severidade: "alta" });
  } else if (reviews < 30) {
    problemas.push({ texto: `Só ${reviews} reviews — pouca prova social`, severidade: "media" });
  } else if (reviews >= 200) {
    positivos.push({ texto: `${reviews.toLocaleString("pt-BR")} reviews — alta volume` });
  }

  if (nota < 3.5) {
    problemas.push({ texto: `Nota ${nota.toFixed(1)} é alta dor`, severidade: "alta" });
  } else if (nota >= 4.5) {
    positivos.push({ texto: `Nota ${nota.toFixed(1)} é excelente` });
  }

  const score = Math.max(
    0,
    Math.min(
      10,
      Math.max(0, (nota - 2.5) * 1.5) +
        4 -
        problemas.filter((p) => p.severidade === "alta").length * 2 -
        problemas.filter((p) => p.severidade === "media").length * 1 +
        Math.min(positivos.length * 0.5, 1.5)
    )
  );

  return {
    fonte: "google_reviews",
    ok: true,
    score: Math.round(score),
    achados: { problemas, atencao, positivos, metricas: { nota, reviews } },
    custo: 0,
    duracao_ms: Date.now() - t0,
  };
}
