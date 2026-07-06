// Facebook — raspa página FB do lead (se existir url ou tenta deduzir do site)

const FIRECRAWL_BASE = "https://api.firecrawl.dev";

import type { FonteResult } from "./site.ts";

export async function analisarFacebook(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();

  let fbUrl = lead.facebook_url;
  if (!fbUrl && lead.raw_data?.original?.url_site) {
    const m = String(lead.raw_data.original.url_site).match(/facebook\.com\/[a-z0-9.]+/i);
    if (m) fbUrl = `https://${m[0]}`;
  }

  if (!fbUrl) {
    return {
      fonte: "facebook",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem URL Facebook",
    };
  }

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: fbUrl, formats: ["markdown"], waitFor: 3000 }),
    });

    if (!res.ok) {
      // 403 = Facebook anti-bot bloqueando — comum, não é erro nosso
      const isBlocked = res.status === 403;
      return {
        fonte: "facebook",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: isBlocked
          ? "Facebook bloqueou a raspagem (anti-bot). Use Meta Graph API quando precisar."
          : `Firecrawl HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const md = (data?.data?.markdown || "") as string;

    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    const curtidasMatch = md.match(/([\d.,]+)\s*(?:pessoas curtiram|likes|curtidas)/i);
    const curtidas = parseLargeNum(curtidasMatch?.[1]);

    const seguidoresMatch = md.match(/([\d.,]+)\s*(?:pessoas seguem|seguidores|followers)/i);
    const seguidores = parseLargeNum(seguidoresMatch?.[1]);

    const ratingMatch = md.match(/(\d[,.]\d)\s*\(([\d.,]+)\s*(?:avalia|review)/i);
    const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(",", ".")) : null;
    const reviews = ratingMatch ? parseInt(ratingMatch[2].replace(/[.,]/g, ""), 10) : null;

    const ultimoPost = /há\s*(\d+)\s*(?:dia|mês|mes|ano|hora)/i.exec(md);
    const diasSemPostar = ultimoPost ? parseInt(ultimoPost[1], 10) : null;

    if (seguidores !== null) {
      if (seguidores < 500) {
        problemas.push({
          texto: `Só ${seguidores} seguidores no Facebook`,
          severidade: "media",
        });
      } else if (seguidores > 10000) {
        positivos.push({ texto: `${seguidores.toLocaleString("pt-BR")} seguidores no FB` });
      }
    } else {
      atencao.push({ texto: "Não consegui ler seguidores do FB (perfil privado/bloqueado)" });
    }

    if (rating !== null) {
      if (rating < 4.0) {
        problemas.push({
          texto: `FB rating ${rating.toFixed(1)} — abaixo da média`,
          severidade: "media",
        });
      } else if (rating >= 4.7) {
        positivos.push({ texto: `Rating ${rating.toFixed(1)} no FB` });
      }
    }

    if (ultimoPost && /(?:mês|mes|ano)/i.test(ultimoPost[0])) {
      problemas.push({
        texto: `Última postagem foi ${ultimoPost[0]} — página inativa`,
        severidade: "alta",
      });
    } else if (ultimoPost && diasSemPostar !== null && diasSemPostar > 14) {
      atencao.push({ texto: `Última postagem ${ultimoPost[0]} — pouca atividade` });
    }

    // WhatsApp link
    const hasWA = /wa\.me|whatsapp/i.test(md);
    if (!hasWA) atencao.push({ texto: "Sem link WhatsApp na página FB" });
    else positivos.push({ texto: "WhatsApp configurado na página" });

    const penaltyAlta = problemas.filter((p) => p.severidade === "alta").length * 2.0;
    const penaltyMedia = problemas.filter((p) => p.severidade === "media").length * 1.0;
    const penaltyAtencao = atencao.length * 0.4;
    const bonus = Math.min(positivos.length * 0.5, 2.0);

    const score = Math.max(0, Math.min(10, 6 - penaltyAlta - penaltyMedia - penaltyAtencao + bonus));

    return {
      fonte: "facebook",
      ok: true,
      score: Math.round(score),
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: { curtidas, seguidores, rating, reviews, ultimo_post: ultimoPost?.[0] },
      },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "facebook",
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
