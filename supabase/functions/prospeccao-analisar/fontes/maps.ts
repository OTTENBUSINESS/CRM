// Análise do perfil Google Maps via Firecrawl (raspa o url_maps)
// Score 0-10 baseado em: nota, qtd reviews, fotos, completude, respostas

const FIRECRAWL_BASE = "https://api.firecrawl.dev";

import type { FonteResult } from "./site.ts";

export async function analisarMaps(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  if (!lead.url_maps) {
    return {
      fonte: "google_maps",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem url Maps",
    };
  }

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: lead.url_maps,
        formats: ["markdown"],
        waitFor: 4000,
      }),
    });

    if (!res.ok) {
      return {
        fonte: "google_maps",
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

    // Nota (do lead OU do markdown)
    const nota = lead.nota_google;
    const reviews = lead.qtd_avaliacoes || 0;

    // ===== Nota =====
    if (nota === null || nota === undefined) {
      atencao.push({ texto: "Sem nota no Google ainda" });
    } else if (nota < 3.5) {
      problemas.push({
        texto: `Nota Google ${nota.toFixed(1)} — afasta cliente que pesquisa antes de comprar`,
        severidade: "alta",
      });
    } else if (nota < 4.3) {
      atencao.push({ texto: `Nota Google ${nota.toFixed(1)} — abaixo da média do nicho (4.5+)` });
    } else {
      positivos.push({ texto: `Nota Google ${nota.toFixed(1)} (acima da média)` });
    }

    // ===== Qtd reviews =====
    if (reviews === 0) {
      problemas.push({
        texto: "Zero reviews no Google — invisível no Maps",
        severidade: "alta",
      });
    } else if (reviews < 20) {
      problemas.push({ texto: `Só ${reviews} reviews — pouca prova social`, severidade: "media" });
    } else if (reviews < 100) {
      atencao.push({ texto: `${reviews} reviews — falta volume pra dominar a busca local` });
    } else {
      positivos.push({ texto: `${reviews} reviews — boa massa crítica` });
    }

    // ===== Telefone =====
    if (!lead.telefone) {
      problemas.push({ texto: "Sem telefone no Maps — perde contato direto", severidade: "media" });
    }

    // ===== Site no Maps =====
    if (!lead.url_site) {
      atencao.push({ texto: "Maps sem link pro site oficial" });
    }

    // ===== Fotos / detecta no markdown =====
    const fotosMatch = md.match(/(\d+)\s*(?:fotos|photos)/i);
    const qtdFotos = fotosMatch ? parseInt(fotosMatch[1], 10) : null;
    if (qtdFotos !== null) {
      if (qtdFotos < 5) {
        problemas.push({ texto: `Só ${qtdFotos} fotos no Maps — perfil pobre`, severidade: "media" });
      } else if (qtdFotos < 20) {
        atencao.push({ texto: `${qtdFotos} fotos — adicione mais (recomendado 30+)` });
      } else {
        positivos.push({ texto: `${qtdFotos} fotos — perfil rico` });
      }
    }

    // ===== Horário =====
    const temHorario = /horário|hours|aberto|fechado|open|closed/i.test(md);
    if (!temHorario) {
      atencao.push({ texto: "Sem horário de funcionamento configurado" });
    }

    // ===== Resposta a reviews =====
    const temResposta = /resposta do proprietário|response from the owner/i.test(md);
    if (!temResposta && reviews > 5) {
      problemas.push({
        texto: "Não responde reviews — sinaliza pra Google que perfil é abandonado",
        severidade: "media",
      });
    } else if (temResposta) {
      positivos.push({ texto: "Responde reviews ativamente" });
    }

    // ===== Score =====
    const penaltyAlta = problemas.filter((p) => p.severidade === "alta").length * 2.0;
    const penaltyMedia = problemas.filter((p) => p.severidade === "media").length * 1.0;
    const penaltyAtencao = atencao.length * 0.4;
    const bonus = Math.min(positivos.length * 0.4, 2.0);

    // bônus base de nota
    let scoreNota = 0;
    if (nota !== null && nota !== undefined) {
      scoreNota = Math.max(0, (nota - 2.5) * 1.5); // 4.5★ = +3, 5.0★ = +3.75
    }

    const score = Math.max(
      0,
      Math.min(10, 5 + scoreNota - penaltyAlta - penaltyMedia - penaltyAtencao + bonus)
    );

    return {
      fonte: "google_maps",
      ok: true,
      score: Math.round(score),
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: {
          nota_google: nota,
          qtd_reviews: reviews,
          qtd_fotos: qtdFotos,
          tem_telefone: !!lead.telefone,
          tem_site: !!lead.url_site,
          tem_horario: temHorario,
          responde_reviews: temResposta,
        },
      },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "google_maps",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}
