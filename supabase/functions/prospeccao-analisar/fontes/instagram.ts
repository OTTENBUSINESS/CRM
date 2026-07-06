// Análise PROFUNDA Instagram via ScrapeCreators
// /v1/instagram/profile  +  /v2/instagram/user/posts
// Sem rate limit (vs RapidAPI)
//
// Extrai: bio, followers, following, posts, ratio, biz, verified,
//         posts_per_month, engagement, mix Reels/Carousel/Image,
//         top hashtags, posicionamento IA, foto HD, link bio validado

import type { FonteResult } from "./site.ts";
import { loadPrompt } from "../load_prompt.ts";
import { integrationKeys } from "../keys.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SC_BASE = "https://api.scrapecreators.com";
const GEMINI_MODEL = "gemini-2.5-flash";

export async function analisarInstagram(
  lead: any,
  _firecrawlApiKey: string
): Promise<FonteResult> {
  const t0 = Date.now();
  const SC_KEY = integrationKeys.SCRAPECREATORS_API_KEY;
  const GEMINI_API_KEY = integrationKeys.GEMINI_API_KEY;

  if (!SC_KEY) {
    return {
      fonte: "instagram",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: "SCRAPECREATORS_API_KEY não configurada",
    };
  }

  let handle = lead.instagram_handle?.replace(/^@/, "");
  if (!handle && lead.raw_data?.original?.url_site) {
    const m = String(lead.raw_data.original.url_site).match(/instagram\.com\/([a-z0-9_.]+)/i);
    if (m) handle = m[1];
  }
  if (!handle) {
    return {
      fonte: "instagram",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem @ Instagram",
    };
  }

  try {
    // 1. Profile
    const profUrl = `${SC_BASE}/v1/instagram/profile?handle=${encodeURIComponent(handle)}`;
    const profRes = await fetch(profUrl, { headers: { "x-api-key": SC_KEY } });

    if (!profRes.ok) {
      return {
        fonte: "instagram",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: Date.now() - t0,
        erro: `ScrapeCreators profile HTTP ${profRes.status}`,
      };
    }

    const profJson = await profRes.json();
    const user = profJson?.data?.user;

    if (!user || !user.username) {
      return {
        fonte: "instagram",
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0.005,
        duracao_ms: Date.now() - t0,
        erro: "Perfil não encontrado",
      };
    }

    const followers = user.edge_followed_by?.count || 0;
    const following = user.edge_follow?.count || 0;
    const totalPosts = user.edge_owner_to_timeline_media?.count || 0;
    const ratio = totalPosts > 0 ? followers / totalPosts : 0;
    const bio = user.biography || "";
    const externalUrl = user.external_url;
    const profilePicHd =
      user.profile_pic_url_hd || user.profile_pic_url || null;
    const isBusinessAccount = user.is_business_account || user.is_professional_account;
    const isVerified = user.is_verified;
    const isPrivate = user.is_private;
    const hasClips = user.has_clips;
    const highlightCount = user.highlight_reel_count || 0;
    const category =
      user.category_name || user.business_category_name || user.overall_category_name;

    // 2. Validar link da bio
    const bioCheck = externalUrl ? await validarLinkBio(externalUrl) : null;

    // 3. Posts (até 12)
    let postsData: any[] = [];
    let postsErr: string | null = null;
    try {
      const postsUrl = `${SC_BASE}/v2/instagram/user/posts?handle=${encodeURIComponent(handle)}`;
      const postsRes = await fetch(postsUrl, { headers: { "x-api-key": SC_KEY } });
      if (postsRes.ok) {
        const j = await postsRes.json();
        postsData = (j?.items || []).slice(0, 12);
      } else {
        postsErr = `posts HTTP ${postsRes.status}`;
      }
    } catch (e) {
      postsErr = String(e);
    }

    // 4. Compila métricas dos posts
    const postsAnalysis = analisarPosts(postsData);
    if (postsAnalysis.avg_likes !== null && followers > 0) {
      postsAnalysis.engagement_rate =
        ((postsAnalysis.avg_likes + (postsAnalysis.avg_comments || 0)) / followers) * 100;
    }

    // 5. IA: posicionamento
    const aiInsights = GEMINI_API_KEY
      ? await analisarPosicionamentoIA(handle, user, postsData, postsAnalysis, GEMINI_API_KEY)
      : null;

    // ===== Achados =====
    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    // Followers
    if (followers < 500) {
      problemas.push({
        texto: `Apenas ${followers.toLocaleString("pt-BR")} seguidores — alcance orgânico mínimo`,
        severidade: "alta",
      });
    } else if (followers < 5000) {
      atencao.push({
        texto: `${followers.toLocaleString("pt-BR")} seguidores — micro perfil`,
      });
    } else if (followers >= 50000) {
      positivos.push({
        texto: `${followers.toLocaleString("pt-BR")} seguidores — grande alcance`,
      });
    } else {
      positivos.push({
        texto: `${followers.toLocaleString("pt-BR")} seguidores — boa base`,
      });
    }

    // Bio
    if (!bio || bio.length < 30) {
      problemas.push({
        texto: `Bio fraca (${bio.length} chars) — não comunica proposta de valor`,
        severidade: "media",
      });
    } else {
      positivos.push({ texto: `Bio: "${bio.slice(0, 80)}${bio.length > 80 ? "..." : ""}"` });
    }

    // Link bio
    if (!externalUrl) {
      problemas.push({
        texto: "Sem link na bio — perde tráfego pro site/WhatsApp",
        severidade: "alta",
      });
    } else if (bioCheck) {
      if (!bioCheck.alive) {
        problemas.push({
          texto: `Link da bio QUEBRADO (HTTP ${bioCheck.status})`,
          severidade: "alta",
        });
      } else if (bioCheck.tipo === "linktree" || bioCheck.tipo === "linkbio_aggregator") {
        atencao.push({
          texto: `Link da bio é Linktree/agregador — clientes precisam de 2 cliques`,
        });
      } else if (bioCheck.tipo === "whatsapp_direto") {
        positivos.push({ texto: "Link da bio vai direto pro WhatsApp ✅" });
      } else if (bioCheck.tipo === "site_proprio") {
        positivos.push({
          texto: `Link da bio leva pro site próprio (${bioCheck.destination_host})`,
        });
      }
    }

    // Business
    if (!isBusinessAccount) {
      problemas.push({
        texto: "Conta sem perfil business — perde insights e botões de contato",
        severidade: "media",
      });
    } else {
      positivos.push({ texto: "Perfil business configurado" });
    }

    if (isPrivate) {
      problemas.push({
        texto: "Perfil PRIVADO — invisível pra leads novos",
        severidade: "alta",
      });
    }

    // Frequência
    if (postsAnalysis.posts_per_month !== null) {
      if (postsAnalysis.posts_per_month < 4) {
        problemas.push({
          texto: `Posta menos de 1×/semana (${postsAnalysis.posts_per_month}/mês)`,
          severidade: "alta",
        });
      } else if (postsAnalysis.posts_per_month < 12) {
        atencao.push({
          texto: `${postsAnalysis.posts_per_month} posts/mês — abaixo do ideal (15-20)`,
        });
      } else {
        positivos.push({
          texto: `${postsAnalysis.posts_per_month} posts/mês — boa cadência`,
        });
      }
    }

    // Mix
    if (postsAnalysis.pct_reels !== null) {
      if (postsAnalysis.pct_reels < 20) {
        problemas.push({
          texto: `Só ${postsAnalysis.pct_reels}% Reels — Instagram prioriza Reels`,
          severidade: "media",
        });
      } else if (postsAnalysis.pct_reels >= 50) {
        positivos.push({
          texto: `${postsAnalysis.pct_reels}% Reels — alinhado com algoritmo`,
        });
      }
    }

    // Engajamento
    if (postsAnalysis.engagement_rate !== null) {
      if (postsAnalysis.engagement_rate < 1) {
        problemas.push({
          texto: `Engajamento ${postsAnalysis.engagement_rate.toFixed(2)}% — bem abaixo da média (3%+)`,
          severidade: "alta",
        });
      } else if (postsAnalysis.engagement_rate < 3) {
        atencao.push({
          texto: `Engajamento ${postsAnalysis.engagement_rate.toFixed(2)}% — abaixo da média`,
        });
      } else {
        positivos.push({
          texto: `Engajamento ${postsAnalysis.engagement_rate.toFixed(2)}% — saudável`,
        });
      }
    }

    if (highlightCount > 0) {
      positivos.push({
        texto: `${highlightCount} highlights organizados (importante pra venda)`,
      });
    }

    // Score
    const penaltyAlta = problemas.filter((p) => p.severidade === "alta").length * 1.5;
    const penaltyMedia = problemas.filter((p) => p.severidade === "media").length * 0.8;
    const penaltyAtencao = atencao.length * 0.4;
    const bonus = Math.min(positivos.length * 0.5, 2.0);
    const score = Math.max(
      0,
      Math.min(10, 6 - penaltyAlta - penaltyMedia - penaltyAtencao + bonus)
    );

    return {
      fonte: "instagram",
      ok: true,
      score: Math.round(score),
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: {
          handle: user.username,
          full_name: user.full_name,
          bio: bio.slice(0, 250),
          link_bio: externalUrl,
          profile_pic_url: profilePicHd,
          followers,
          following,
          posts: totalPosts,
          ratio: +ratio.toFixed(1),
          is_business: isBusinessAccount,
          is_verified: isVerified,
          is_private: isPrivate,
          has_clips: hasClips,
          highlight_count: highlightCount,
          category,
          // Bio link
          bio_link_alive: bioCheck?.alive,
          bio_link_status: bioCheck?.status,
          bio_link_tipo: bioCheck?.tipo,
          bio_link_destination: bioCheck?.destination_url,
          bio_link_destination_host: bioCheck?.destination_host,
          bio_link_redirects: bioCheck?.redirects,
          // Posts
          posts_analisados: postsAnalysis.count,
          posts_per_month: postsAnalysis.posts_per_month,
          dias_desde_ultimo_post: postsAnalysis.dias_desde_ultimo,
          pct_reels: postsAnalysis.pct_reels,
          pct_carousel: postsAnalysis.pct_carousel,
          pct_image: postsAnalysis.pct_image,
          engagement_rate: postsAnalysis.engagement_rate,
          avg_likes: postsAnalysis.avg_likes,
          avg_comments: postsAnalysis.avg_comments,
          top_hashtags: postsAnalysis.top_hashtags,
          ultimo_post_caption: postsAnalysis.ultimo_post_caption,
          posts_recentes: postsAnalysis.posts_summary,
          // IA — análise estratégica
          ai_posicionamento: aiInsights?.posicionamento,
          ai_persona_alvo: aiInsights?.persona_alvo,
          ai_tom_voz: aiInsights?.tom_voz,
          ai_pilares_conteudo: aiInsights?.pilares_conteudo,
          ai_gaps: aiInsights?.gaps,
          ai_recomendacoes: aiInsights?.recomendacoes,
          // Framework Frank Costa
          ai_pilares_posicionamento: aiInsights?.pilares_posicionamento,
          ai_bio_framework: aiInsights?.bio_framework,
          ai_tipos_conteudo: aiInsights?.tipos_conteudo,
          ai_destaques_estrategicos: aiInsights?.destaques_estrategicos,
          ai_erros_amadores: aiInsights?.erros_amadores,
          ai_codigos_autoridade: aiInsights?.codigos_autoridade,
          ai_veredicto_frank_costa: aiInsights?.veredicto_frank_costa,
          ...(postsErr ? { erro_posts: postsErr } : {}),
        },
      },
      custo: 0.01 + (aiInsights ? 0.001 : 0),
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "instagram",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: Date.now() - t0,
      erro: String(e),
    };
  }
}

// ============================================================
// HELPERS
// ============================================================

function analisarPosts(posts: any[]) {
  if (!posts || posts.length === 0) {
    return {
      count: 0,
      posts_per_month: null,
      dias_desde_ultimo: null,
      pct_reels: null,
      pct_carousel: null,
      pct_image: null,
      engagement_rate: null,
      avg_likes: null,
      avg_comments: null,
      top_hashtags: [] as string[],
      ultimo_post_caption: null,
      posts_summary: [] as any[],
    };
  }

  const now = Date.now();
  let totalLikes = 0;
  let totalComments = 0;
  let countPosts = 0;
  let reels = 0;
  let carousel = 0;
  let image = 0;
  const hashtagCount: Record<string, number> = {};
  const summary: any[] = [];
  let oldestTs: number | null = null;
  let newestTs: number | null = null;

  for (const p of posts) {
    const ts = (p.taken_at || p.taken_at_timestamp || 0) * 1000;
    if (ts) {
      if (!oldestTs || ts < oldestTs) oldestTs = ts;
      if (!newestTs || ts > newestTs) newestTs = ts;
    }
    const likes = p.like_count || p.edge_media_preview_like?.count || 0;
    const comments = p.comment_count || p.edge_media_to_comment?.count || 0;
    totalLikes += likes;
    totalComments += comments;
    countPosts++;

    const isReel = p.product_type === "clips";
    const isCarousel = p.media_type === 8 || (p.carousel_media?.length ?? 0) > 0;
    if (isReel) reels++;
    else if (isCarousel) carousel++;
    else image++;

    const captionRaw = typeof p.caption === "object" ? p.caption?.text : p.caption;
    const caption = String(captionRaw || "");
    const tags = caption.match(/#[\wÀ-ɏ]+/g);
    if (tags) {
      for (const t of tags) {
        const k = t.toLowerCase();
        hashtagCount[k] = (hashtagCount[k] || 0) + 1;
      }
    }

    // Extrai thumb da imagem
    let thumb: string | null = null;
    if (p.image_versions2?.candidates?.[0]?.url) {
      thumb = p.image_versions2.candidates[0].url;
    } else if (p.thumbnail_url) {
      thumb = p.thumbnail_url;
    } else if (p.display_url) {
      thumb = p.display_url;
    }

    summary.push({
      tipo: isReel ? "reel" : isCarousel ? "carousel" : "image",
      likes,
      comments,
      data: ts ? new Date(ts).toISOString().slice(0, 10) : null,
      caption_preview: caption.slice(0, 120),
      shortcode: p.code,
      thumb,
      url: p.code ? `https://www.instagram.com/p/${p.code}/` : null,
    });
  }

  const total = reels + carousel + image;
  const avgLikes = countPosts > 0 ? Math.round(totalLikes / countPosts) : 0;
  const avgComments = countPosts > 0 ? Math.round(totalComments / countPosts) : 0;
  const diasSpan = oldestTs && newestTs ? Math.max(1, (newestTs - oldestTs) / 86400000) : 30;
  const diasDesdeUltimo = newestTs ? Math.round((now - newestTs) / 86400000) : null;

  // Cadência REAL atual = posts dos últimos 30 dias
  // (não diluir por posts antigos misturados nos 12 mais recentes)
  const cutoff30d = now - 30 * 86400000;
  const postsLast30d = posts.filter((p) => {
    const ts = (p.taken_at || p.taken_at_timestamp || 0) * 1000;
    return ts > cutoff30d;
  }).length;
  const postsPerMonth = postsLast30d > 0 ? postsLast30d : 0;

  // Cadência média (TODO o intervalo) — fica como referência
  const postsPerMonthMedio = total > 0 ? +(((total / diasSpan) * 30).toFixed(1)) : null;

  return {
    count: total,
    posts_per_month: postsPerMonth,
    posts_per_month_medio: postsPerMonthMedio,
    posts_last_30d: postsLast30d,
    intervalo_dias_amostra: Math.round(diasSpan),
    dias_desde_ultimo: diasDesdeUltimo,
    pct_reels: total > 0 ? Math.round((reels / total) * 100) : null,
    pct_carousel: total > 0 ? Math.round((carousel / total) * 100) : null,
    pct_image: total > 0 ? Math.round((image / total) * 100) : null,
    engagement_rate: null as number | null,
    avg_likes: avgLikes,
    avg_comments: avgComments,
    top_hashtags: Object.entries(hashtagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([h]) => h),
    ultimo_post_caption: summary[0]?.caption_preview || null,
    posts_summary: summary,
  };
}

// ============================================================
// Validador de link da bio
// ============================================================

interface BioCheck {
  alive: boolean;
  status: number | null;
  destination_url: string | null;
  destination_host: string | null;
  redirects: number;
  tipo: "linktree" | "linkbio_aggregator" | "whatsapp_direto" | "site_proprio" | "social_other" | "desconhecido";
  erro?: string;
}

async function validarLinkBio(url: string): Promise<BioCheck> {
  const result: BioCheck = {
    alive: false,
    status: null,
    destination_url: null,
    destination_host: null,
    redirects: 0,
    tipo: "desconhecido",
  };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });
    clearTimeout(timer);

    result.status = res.status;
    result.alive = res.ok;
    result.destination_url = res.url;
    result.redirects = res.url !== url ? 1 : 0;

    try {
      const dest = new URL(res.url);
      result.destination_host = dest.hostname.replace(/^www\./, "");
    } catch {
      // ignore
    }

    const host = (result.destination_host || "").toLowerCase();
    if (host.includes("linktr.ee") || host.includes("linktree")) result.tipo = "linktree";
    else if (
      host.includes("bio.link") || host.includes("beacons.ai") ||
      host.includes("linkin.bio") || host.includes("komi.io") ||
      host.includes("solo.to") || host.includes("about.me") ||
      host.includes("hopp.bio")
    ) result.tipo = "linkbio_aggregator";
    else if (host.includes("wa.me") || host.includes("whatsapp.com")) result.tipo = "whatsapp_direto";
    else if (
      host.includes("instagram.com") || host.includes("facebook.com") ||
      host.includes("twitter.com") || host.includes("tiktok.com") ||
      host.includes("youtube.com")
    ) result.tipo = "social_other";
    else if (host && host.length > 0) result.tipo = "site_proprio";

    return result;
  } catch (e) {
    result.erro = String(e);
    return result;
  }
}

async function analisarPosicionamentoIA(
  handle: string,
  user: any,
  posts: any[],
  analysis: ReturnType<typeof analisarPosts>,
  geminiKey: string
) {
  const postsCompact = (analysis.posts_summary || [])
    .slice(0, 12)
    .map((p: any, i: number) =>
      `[${i + 1}] ${p.tipo} · ${p.data} · ${p.likes}❤️ ${p.comments}💬\n   ${p.caption_preview}`
    )
    .join("\n");

  const followers = user.edge_followed_by?.count || 0;
  const totalPosts = user.edge_owner_to_timeline_media?.count || 0;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const cfg = await loadPrompt(supabase, "ig_posicionamento", {
    handle,
    full_name: user.full_name || handle,
    category: user.category_name || user.business_category_name || "(não definida)",
    bio: user.biography || "(vazia)",
    external_url: user.external_url || "(sem)",
    followers: followers.toLocaleString("pt-BR"),
    total_posts: totalPosts,
    is_verified: user.is_verified ? "sim" : "não",
    is_business: user.is_business_account || user.is_professional_account ? "sim" : "não",
    highlight_count: user.highlight_reel_count || 0,
    posts_analisados: analysis.count,
    posts_per_month: analysis.posts_per_month,
    dias_desde_ultimo: analysis.dias_desde_ultimo,
    pct_reels: analysis.pct_reels,
    pct_carousel: analysis.pct_carousel,
    pct_image: analysis.pct_image,
    avg_likes: analysis.avg_likes,
    avg_comments: analysis.avg_comments,
    top_hashtags: (analysis.top_hashtags || []).slice(0, 10).join(" "),
    posts_compact: postsCompact,
  }, {
    prompt_text: "Analise o perfil do Instagram e retorne JSON com posicionamento, persona_alvo, tom_voz, pilares_conteudo, gaps, recomendacoes.",
    ai_model: GEMINI_MODEL,
    temperature: 0.4,
  });


  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.ai_model}:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: cfg.prompt_text }] }],
        generationConfig: { temperature: cfg.temperature, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) {
      console.error("[IG-IA] Gemini error", await res.text());
      return null;
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(raw);
  } catch (e) {
    console.error("[IG-IA] erro", e);
    return null;
  }
}
