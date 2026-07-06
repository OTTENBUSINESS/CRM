// LinkedIn (perfil pessoal do fundador) — ScrapeCreators
// Usa: /v1/linkedin/profile?url=https://www.linkedin.com/in/X

import type { FonteResult } from "./site.ts";
import { integrationKeys } from "../keys.ts";

const SC_BASE = "https://api.scrapecreators.com";

export async function analisarLinkedinFounder(lead: any, _fcKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  const SC_KEY = integrationKeys.SCRAPECREATORS_API_KEY;

  // Tenta achar URL LinkedIn /in/X
  let url: string | null = null;
  if (lead.linkedin_founder_url) url = lead.linkedin_founder_url;
  else if (lead.linkedin_url && /linkedin\.com\/in\//.test(lead.linkedin_url)) url = lead.linkedin_url;
  else if (lead.raw_data?.original?.url_site) {
    const m = String(lead.raw_data.original.url_site).match(/linkedin\.com\/in\/[a-z0-9-]+/i);
    if (m) url = `https://www.${m[0]}`;
  }

  if (!url) {
    return {
      fonte: "linkedin_founder",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem perfil LinkedIn pessoal mapeado",
    };
  }

  if (!SC_KEY) {
    return {
      fonte: "linkedin_founder",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: "SCRAPECREATORS_API_KEY não configurada",
    };
  }

  try {
    const res = await fetch(`${SC_BASE}/v1/linkedin/profile?url=${encodeURIComponent(url)}`, {
      headers: { "x-api-key": SC_KEY },
    });
    if (!res.ok) {
      return {
        fonte: "linkedin_founder",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: `ScrapeCreators HTTP ${res.status}`,
      };
    }
    const json = await res.json();
    if (!json?.name && !json?.followers) {
      return {
        fonte: "linkedin_founder",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0.005,
        duracao_ms: Date.now() - t0,
        erro: "Perfil LinkedIn não encontrado",
      };
    }

    const followers = json.followers || 0;
    const recentPosts = (json.recentPosts || []).length;
    const articles = (json.articles || []).length;
    const experiencias = (json.experience || []).length;
    const recomendacoes = (json.recommendations || []).length;

    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    if (!json.about || json.about.length < 50) {
      atencao.push({ texto: "Sem bio/sobre detalhada no LinkedIn" });
    } else {
      positivos.push({ texto: "Bio LinkedIn estruturada" });
    }

    if (followers < 500) {
      problemas.push({
        texto: `Só ${followers} seguidores no LinkedIn — pouca presença pessoal`,
        severidade: "media",
      });
    } else if (followers > 5000) {
      positivos.push({
        texto: `${followers.toLocaleString("pt-BR")} seguidores no LinkedIn — autoridade`,
      });
    }

    if (recentPosts === 0 && articles === 0) {
      atencao.push({ texto: "Sem posts/artigos recentes no LinkedIn — perfil estagnado" });
    } else if (recentPosts > 0) {
      positivos.push({ texto: `${recentPosts} posts recentes` });
    }

    if (experiencias > 5) {
      positivos.push({ texto: `${experiencias} experiências profissionais listadas` });
    }

    if (recomendacoes > 0) {
      positivos.push({ texto: `${recomendacoes} recomendações públicas` });
    }

    const penaltyMedia = problemas.filter((p) => p.severidade === "media").length * 1;
    const penaltyAtencao = atencao.length * 0.4;
    const bonus = Math.min(positivos.length * 0.5, 2.0);
    const score = Math.max(0, Math.min(10, 6 - penaltyMedia - penaltyAtencao + bonus));

    return {
      fonte: "linkedin_founder",
      ok: true,
      score: Math.round(score),
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: {
          name: json.name,
          location: json.location,
          followers,
          recentPosts,
          articles,
          experiencias,
          recomendacoes,
          about: (json.about || "").slice(0, 200),
          image: json.image,
        },
      },
      custo: 0.01,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "linkedin_founder",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}
