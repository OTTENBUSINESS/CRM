// TikTok — raspa /@handle
const FIRECRAWL_BASE = "https://api.firecrawl.dev";
import type { FonteResult } from "./site.ts";

export async function analisarTiktok(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  let handle = lead.tiktok_handle?.replace(/^@/, "");
  if (!handle && lead.raw_data?.original?.url_site) {
    const m = String(lead.raw_data.original.url_site).match(/tiktok\.com\/@([a-z0-9_.]+)/i);
    if (m) handle = m[1];
  }
  if (!handle) {
    return {
      fonte: "tiktok",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem @ TikTok",
    };
  }

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: `https://www.tiktok.com/@${handle}`, formats: ["markdown"], waitFor: 3000 }),
    });
    if (!res.ok) {
      return {
        fonte: "tiktok",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: res.status === 403 ? "TikTok anti-bot bloqueou" : `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const md = (data?.data?.markdown || "") as string;
    const meta = (data?.data?.metadata || {}) as Record<string, any>;

    const followersMatch =
      md.match(/([\d,.]+\s*(?:k|m|mil)?)\s*(?:Followers|seguidores)/i) ||
      meta.description?.match(/([\d,.]+\s*(?:k|m|mil)?)\s*(?:Followers|seguidores)/i);
    const followers = parseLargeNum(followersMatch?.[1]);

    const likesMatch = md.match(/([\d,.]+\s*(?:k|m|mil)?)\s*(?:Likes|curtidas)/i);
    const likes = parseLargeNum(likesMatch?.[1]);

    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    if (followers === null) {
      atencao.push({ texto: "Não consegui ler followers TikTok" });
    } else if (followers < 1000) {
      problemas.push({ texto: `Só ${followers} followers — perfil novo/inativo`, severidade: "media" });
    } else if (followers > 50000) {
      positivos.push({ texto: `${followers.toLocaleString("pt-BR")} followers — boa presença TikTok` });
    }

    if (likes !== null && followers && likes < followers * 5) {
      atencao.push({ texto: `Engajamento baixo (${likes} likes vs ${followers} followers)` });
    }

    const score = Math.max(
      0,
      Math.min(
        10,
        5 +
          Math.min(positivos.length * 0.6, 2.5) -
          problemas.filter((p) => p.severidade === "alta").length * 2 -
          problemas.filter((p) => p.severidade === "media").length * 1 -
          atencao.length * 0.4
      )
    );
    return {
      fonte: "tiktok",
      ok: true,
      score: Math.round(score),
      achados: { problemas, atencao, positivos, metricas: { handle, followers, likes } },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "tiktok",
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
