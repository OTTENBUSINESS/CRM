// PageSpeed Insights — Google API (grátis)
// Mede Core Web Vitals + performance score do site mobile e desktop

import type { FonteResult } from "./site.ts";
import { integrationKeys } from "../keys.ts";

const PSI_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export async function analisarPageSpeed(lead: any, _firecrawlKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  if (!lead.url_site) {
    return {
      fonte: "pagespeed",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem site",
    };
  }

  // Tenta GOOGLE_PAGESPEED_KEY → fallback GEMINI_API_KEY (mesma chave Google Cloud)
  const apiKey = integrationKeys.GOOGLE_PAGESPEED_KEY || integrationKeys.GEMINI_API_KEY;
  const keyParam = apiKey ? `&key=${apiKey}` : "";

  try {
    const fetchPS = async (strategy: "mobile" | "desktop", categories: string[]) => {
      const cats = categories.map((c) => `&category=${c}`).join("");
      const url = `${PSI_BASE}?url=${encodeURIComponent(lead.url_site)}&strategy=${strategy}${cats}${keyParam}`;
      const r = await fetch(url);
      if (r.ok) return { ok: true, data: await r.json(), erro: null };
      const errText = await r.text();
      return { ok: false, data: null, erro: `HTTP ${r.status}: ${errText.slice(0, 200)}` };
    };

    const [mobileRes, desktopRes] = await Promise.allSettled([
      fetchPS("mobile", ["performance", "seo", "accessibility"]),
      fetchPS("desktop", ["performance"]),
    ]);

    const mobile =
      mobileRes.status === "fulfilled" && mobileRes.value.ok ? mobileRes.value.data : null;
    const desktop =
      desktopRes.status === "fulfilled" && desktopRes.value.ok ? desktopRes.value.data : null;

    const errMobile = mobileRes.status === "fulfilled" ? mobileRes.value.erro : String(mobileRes.reason);
    const errDesktop = desktopRes.status === "fulfilled" ? desktopRes.value.erro : String(desktopRes.reason);

    if (!mobile && !desktop) {
      return {
        fonte: "pagespeed",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: `Mobile: ${errMobile} | Desktop: ${errDesktop}`,
      };
    }

    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    const mobileScore = mobile?.lighthouseResult?.categories?.performance?.score;
    const desktopScore = desktop?.lighthouseResult?.categories?.performance?.score;
    const seoScore = mobile?.lighthouseResult?.categories?.seo?.score;
    const a11yScore = mobile?.lighthouseResult?.categories?.accessibility?.score;

    const mobileScore100 = mobileScore !== undefined ? Math.round(mobileScore * 100) : null;
    const desktopScore100 = desktopScore !== undefined ? Math.round(desktopScore * 100) : null;
    const seo100 = seoScore !== undefined ? Math.round(seoScore * 100) : null;
    const a11y100 = a11yScore !== undefined ? Math.round(a11yScore * 100) : null;

    // Core Web Vitals (mobile)
    const audits = mobile?.lighthouseResult?.audits || {};
    const lcp = audits["largest-contentful-paint"]?.numericValue
      ? Math.round(audits["largest-contentful-paint"].numericValue) / 1000
      : null;
    const fid = audits["max-potential-fid"]?.numericValue
      ? Math.round(audits["max-potential-fid"].numericValue)
      : null;
    const cls = audits["cumulative-layout-shift"]?.numericValue;
    const tbt = audits["total-blocking-time"]?.numericValue
      ? Math.round(audits["total-blocking-time"].numericValue)
      : null;
    const fcp = audits["first-contentful-paint"]?.numericValue
      ? Math.round(audits["first-contentful-paint"].numericValue) / 1000
      : null;

    // ===== Achados =====
    if (mobileScore100 !== null) {
      if (mobileScore100 < 50) {
        problemas.push({
          texto: `PageSpeed mobile ${mobileScore100}/100 — site muito lento, leads abandonam`,
          severidade: "alta",
        });
      } else if (mobileScore100 < 75) {
        atencao.push({ texto: `PageSpeed mobile ${mobileScore100}/100 — espaço pra melhorar` });
      } else {
        positivos.push({ texto: `PageSpeed mobile ${mobileScore100}/100 — site rápido` });
      }
    }

    if (desktopScore100 !== null && desktopScore100 < 70) {
      atencao.push({ texto: `PageSpeed desktop ${desktopScore100}/100` });
    }

    // LCP
    if (lcp !== null) {
      if (lcp > 4) {
        problemas.push({
          texto: `LCP ${lcp.toFixed(1)}s — imagem principal demora demais a carregar (Google penaliza)`,
          severidade: "alta",
        });
      } else if (lcp > 2.5) {
        atencao.push({ texto: `LCP ${lcp.toFixed(1)}s — abaixo do ideal (<2.5s)` });
      }
    }

    // CLS
    if (cls !== undefined && cls !== null) {
      if (cls > 0.25) {
        problemas.push({
          texto: `CLS ${cls.toFixed(2)} — layout pula durante carregamento (UX ruim)`,
          severidade: "media",
        });
      } else if (cls > 0.1) {
        atencao.push({ texto: `CLS ${cls.toFixed(2)} — pequenos saltos de layout` });
      }
    }

    // TBT
    if (tbt !== null && tbt > 600) {
      atencao.push({ texto: `Total Blocking Time ${tbt}ms — JS pesado bloqueia interação` });
    }

    if (seo100 !== null && seo100 < 80) {
      atencao.push({ texto: `SEO score Lighthouse ${seo100}/100` });
    }

    if (a11y100 !== null && a11y100 < 70) {
      atencao.push({
        texto: `Acessibilidade ${a11y100}/100 — pode estar perdendo usuários com necessidades especiais`,
      });
    }

    // Score consolidado
    let score = 5;
    if (mobileScore100 !== null) {
      if (mobileScore100 < 30) score = 2;
      else if (mobileScore100 < 50) score = 3;
      else if (mobileScore100 < 75) score = 6;
      else if (mobileScore100 < 90) score = 8;
      else score = 9;
    }

    return {
      fonte: "pagespeed",
      ok: true,
      score,
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: {
          mobile_score: mobileScore100,
          desktop_score: desktopScore100,
          seo_score: seo100,
          accessibility_score: a11y100,
          lcp_seconds: lcp,
          cls,
          tbt_ms: tbt,
          fcp_seconds: fcp,
        },
      },
      custo: 0,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "pagespeed",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}
