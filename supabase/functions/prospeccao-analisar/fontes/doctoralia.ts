// Doctoralia — busca o nome do lead no Doctoralia.com.br
// Score baseado em: encontrado/não, nota, qtd avaliações, fotos perfil

const FIRECRAWL_BASE = "https://api.firecrawl.dev";

import type { FonteResult } from "./site.ts";

export async function analisarDoctoralia(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  if (!lead.nome) {
    return {
      fonte: "doctoralia",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem nome",
    };
  }

  const query = encodeURIComponent(lead.nome);
  const url = `https://www.doctoralia.com.br/pesquisa?q=${query}`;

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], waitFor: 2500 }),
    });

    if (!res.ok) {
      return {
        fonte: "doctoralia",
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

    // Detecta presença
    const semResultados =
      /sem resultados|nenhum resultado|0 profissional/i.test(md) || md.length < 800;

    if (semResultados) {
      problemas.push({
        texto: "Não encontrei perfil no Doctoralia — perde busca de quem procura médico online",
        severidade: "alta",
      });

      const score = 2;
      return {
        fonte: "doctoralia",
        ok: true,
        score,
        achados: { problemas, atencao, positivos, metricas: { encontrado: false } },
        custo: 0.015,
        duracao_ms: Date.now() - t0,
      };
    }

    // Busca primeira nota encontrada
    const notaMatch = md.match(/(\d[,.]\d)\s*(?:\/\s*5|de 5|⭐|estrelas)/i);
    const nota = notaMatch ? parseFloat(notaMatch[1].replace(",", ".")) : null;

    const reviewsMatch = md.match(/(\d+)\s*(?:opini(?:ã|õ)es|avalia(?:çõ|co)es|reviews)/i);
    const reviews = reviewsMatch ? parseInt(reviewsMatch[1], 10) : null;

    if (nota !== null) {
      if (nota < 4.0) {
        problemas.push({
          texto: `Doctoralia ${nota.toFixed(1)} — nota baixa pra área de saúde`,
          severidade: "alta",
        });
      } else if (nota < 4.7) {
        atencao.push({ texto: `Doctoralia ${nota.toFixed(1)} — área saúde puxa pra 4.8+` });
      } else {
        positivos.push({ texto: `Excelente ${nota.toFixed(1)} no Doctoralia` });
      }
    }

    if (reviews !== null) {
      if (reviews < 10) atencao.push({ texto: `Só ${reviews} opiniões — pouca prova social` });
      else if (reviews >= 50) positivos.push({ texto: `${reviews} opiniões no Doctoralia` });
    }

    // Foto / completude
    if (!md.includes("foto") && !md.includes("CRM")) {
      atencao.push({ texto: "Perfil parece incompleto (sem foto/CRM visível)" });
    }

    const penaltyAlta = problemas.filter((p) => p.severidade === "alta").length * 2.0;
    const penaltyMedia = problemas.filter((p) => p.severidade === "media").length * 1.0;
    const penaltyAtencao = atencao.length * 0.4;
    const bonus = Math.min(positivos.length * 0.5, 2.0);

    const baseScore = nota !== null ? (nota - 2.5) * 1.5 : 4;
    const score = Math.max(
      0,
      Math.min(10, 5 + baseScore - penaltyAlta - penaltyMedia - penaltyAtencao + bonus)
    );

    return {
      fonte: "doctoralia",
      ok: true,
      score: Math.round(score),
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: { encontrado: true, nota, reviews },
      },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "doctoralia",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}
