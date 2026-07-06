// Meta Ad Library — anúncios FB/IG ativos
// Tenta ScrapeCreators primeiro, fallback Firecrawl scrape da URL pública

import type { FonteResult } from "./site.ts";
import { integrationKeys } from "../keys.ts";

const SC_BASE = "https://api.scrapecreators.com";
const FC_BASE = "https://api.firecrawl.dev";

export async function analisarMetaAds(lead: any, firecrawlKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  const SC_KEY = integrationKeys.SCRAPECREATORS_API_KEY;

  const queryParts = [lead.nome];
  if (lead.cidade) queryParts.push(lead.cidade);
  const query = queryParts.join(" ");

  const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
  const atencao: { texto: string }[] = [];
  const positivos: { texto: string }[] = [];
  const metricas: Record<string, unknown> = { fonte_dados: "" };

  let adsAtivos = 0;
  let plataformas: string[] = [];
  let amostraCriativos: any[] = [];
  let custo = 0;
  let erro: string | null = null;

  // ===== 1. Tenta ScrapeCreators =====
  if (SC_KEY) {
    try {
      const url = `${SC_BASE}/v1/facebook/adLibrary/search/ads?query=${encodeURIComponent(query)}&country=BR&active_status=ACTIVE`;
      const res = await fetch(url, {
        headers: { "x-api-key": SC_KEY },
      });
      if (res.ok) {
        const data = await res.json();
        // Shape REAL ScrapeCreators: { searchResults: [...], searchResultsCount: N }
        const totalCount = data?.searchResultsCount || 0;
        const ads = data?.searchResults || data?.results || [];
        adsAtivos = totalCount;

        amostraCriativos = (Array.isArray(ads) ? ads.slice(0, 6) : []).map((a: any) => {
          const snapshot = a.snapshot || {};
          // Extrai thumb da imagem do ad (resized OR original)
          let thumb: string | null = null;
          if (Array.isArray(snapshot.images) && snapshot.images[0]) {
            thumb =
              snapshot.images[0].resized_image_url ||
              snapshot.images[0].original_image_url ||
              snapshot.images[0].watermarked_resized_image_url ||
              null;
          }
          if (!thumb && Array.isArray(snapshot.videos) && snapshot.videos[0]) {
            thumb =
              snapshot.videos[0].video_preview_image_url ||
              snapshot.videos[0].watermarked_video_thumb_url ||
              null;
          }
          if (!thumb && Array.isArray(snapshot.cards) && snapshot.cards[0]) {
            thumb =
              snapshot.cards[0].resized_image_url ||
              snapshot.cards[0].original_image_url ||
              null;
          }

          // Detecta se é vídeo
          const isVideo = Array.isArray(snapshot.videos) && snapshot.videos.length > 0;

          return {
            ad_archive_id: a.ad_archive_id,
            page_name: snapshot.page_name || a.page_name,
            page_id: a.page_id || snapshot.page_id,
            page_profile_uri: snapshot.page_profile_uri,
            page_profile_picture_url: snapshot.page_profile_picture_url,
            cta_text: snapshot.cta_text,
            body_text: snapshot.body?.text?.slice(0, 280) || "",
            caption: snapshot.caption,
            categorias: a.categories,
            currency: a.currency,
            spend: a.spend,
            reach_estimate: a.reach_estimate,
            is_active: a.is_active,
            thumb,
            is_video: isVideo,
            ad_url: a.ad_archive_id
              ? `https://www.facebook.com/ads/library/?id=${a.ad_archive_id}`
              : null,
          };
        });

        // Pages únicas (várias ads podem ser da mesma marca)
        const pageNames = new Set<string>();
        for (const a of ads as any[]) {
          const n = a.snapshot?.page_name || a.page_name;
          if (n) pageNames.add(n);
        }
        metricas.pages_unicas = Array.from(pageNames);

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
  if (metricas.fonte_dados === "" && firecrawlKey) {
    try {
      const fbUrl = `https://www.facebook.com/ads/library/?country=BR&q=${encodeURIComponent(query)}&active_status=active&ad_type=all`;
      const res = await fetch(`${FC_BASE}/v1/scrape`, {
        method: "POST",
        headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: fbUrl, formats: ["markdown"], waitFor: 4000 }),
      });
      if (res.ok) {
        const j = await res.json();
        const md = j?.data?.markdown || "";
        // Estimativa por contagem de "ad library" nos resultados
        const adsMatch = md.match(/(\d+)\s*(?:resultados|results|anúncios|ads)/i);
        if (adsMatch) {
          adsAtivos = parseInt(adsMatch[1], 10);
        } else if (md.length > 500 && /biblioteca de anúncios|ad library/i.test(md)) {
          // Tenta contar ocorrências de ID de anúncio
          const idMatches = md.match(/\bID:\s*\d+/g) || [];
          adsAtivos = idMatches.length;
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
  metricas.plataformas = plataformas;
  if (amostraCriativos.length > 0) metricas.amostra_criativos = amostraCriativos;

  // ===== Achados =====
  if (metricas.fonte_dados === "") {
    return {
      fonte: "meta_ads",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: erro || "Nenhuma API disponível",
    };
  }

  if (adsAtivos === 0) {
    problemas.push({
      texto: "Nenhum anúncio ativo no Meta Ads (FB/IG) — depende 100% de tráfego orgânico",
      severidade: "alta",
    });
  } else if (adsAtivos < 3) {
    atencao.push({
      texto: `Apenas ${adsAtivos} anúncio${adsAtivos > 1 ? "s" : ""} ativo${adsAtivos > 1 ? "s" : ""} — escala limitada`,
    });
  } else if (adsAtivos < 10) {
    positivos.push({ texto: `${adsAtivos} anúncios ativos no Meta — operação de tráfego ativa` });
  } else {
    positivos.push({ texto: `${adsAtivos}+ anúncios ativos — estratégia de Ads consolidada` });
  }

  if (plataformas.length > 0) {
    positivos.push({ texto: `Anuncia em: ${plataformas.join(", ")}` });
  }

  // Score
  let score = 5;
  if (adsAtivos === 0) score = 1;
  else if (adsAtivos < 3) score = 4;
  else if (adsAtivos < 10) score = 7;
  else score = 9;

  return {
    fonte: "meta_ads",
    ok: true,
    score,
    achados: { problemas, atencao, positivos, metricas },
    custo,
    duracao_ms: Date.now() - t0,
  };
}
