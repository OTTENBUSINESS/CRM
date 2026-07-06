// Enriquecedor EXAUSTIVO — descoberta cruzada em loop
//
// Round 1 (Google Search): query "{nome} {cidade}" → extrai TODAS URLs públicas
// Round 2 (IG profile): se tem handle, pega bio external_url → vira site se for próprio
// Round 3 (Site scrape): se tem site, regex no HTML acha IG/FB/YT/LinkedIn/TikTok/WhatsApp
// Loop até nada novo (max 3 iterações)

const FIRECRAWL_BASE = "https://api.firecrawl.dev";
const SC_BASE = "https://api.scrapecreators.com";

export interface EnriquecimentoResult {
  url_site: string | null;
  instagram_handle: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
  tiktok_handle: string | null;
  telefone: string | null;
  custo: number;
  duracao_ms: number;
  fontes_consultadas: string[];
  iterations: number;
  erro: string | null;
}

export async function enriquecerLead(
  lead: any,
  firecrawlKey: string,
  scKey: string | null = null
): Promise<EnriquecimentoResult> {
  const t0 = Date.now();
  const SC_KEY = scKey;

  const result: EnriquecimentoResult = {
    url_site: lead.url_site || null,
    instagram_handle: lead.instagram_handle || null,
    facebook_url: lead.facebook_url || null,
    linkedin_url: lead.linkedin_url || null,
    youtube_url: lead.youtube_url || null,
    tiktok_handle: lead.tiktok_handle || null,
    telefone: lead.telefone || null,
    custo: 0,
    duracao_ms: 0,
    fontes_consultadas: [],
    iterations: 0,
    erro: null,
  };

  const MAX_ITER = 3;
  let mudou = true;

  // Tracking pra não repetir chamadas
  const calledGoogle = new Set<string>();
  const calledIG = new Set<string>();
  const calledSite = new Set<string>();

  while (mudou && result.iterations < MAX_ITER) {
    mudou = false;
    result.iterations++;

    // ===== ROUND 1: Google Search =====
    // ATENÇÃO: só roda se temos NOME + CIDADE (real) pra evitar puxar
    // qualquer pessoa homônima quando lead é "@usuario" sem contexto.
    const nomeRealParaBusca =
      lead.nome &&
      lead.cidade &&
      !lead.nome.startsWith("@") &&
      !/^https?:\/\//i.test(lead.nome) &&
      lead.nome.length > 4;

    if (nomeRealParaBusca && (!result.url_site || !result.instagram_handle)) {
      const query = `${lead.nome} ${lead.cidade}`;
      if (!calledGoogle.has(query)) {
        calledGoogle.add(query);
        const found = await buscarViaGoogle(query, firecrawlKey);
        if (mergeIfEmpty(result, found)) mudou = true;
        if (found.custo > 0) {
          result.custo += found.custo;
          result.fontes_consultadas.push("google_search");
        }
      }
    }

    // ===== ROUND 2: IG profile → bio link =====
    if (result.instagram_handle && SC_KEY && !calledIG.has(result.instagram_handle)) {
      calledIG.add(result.instagram_handle);
      const found = await buscarViaIG(result.instagram_handle, SC_KEY, firecrawlKey);
      if (mergeIfEmpty(result, found)) mudou = true;
      if (found.custo > 0) {
        result.custo += found.custo;
        result.fontes_consultadas.push("ig_profile");
      }
    }

    // ===== ROUND 3: Site scrape → links sociais =====
    if (result.url_site && !calledSite.has(result.url_site)) {
      calledSite.add(result.url_site);
      const found = await buscarViaSite(result.url_site, firecrawlKey);
      if (mergeIfEmpty(result, found)) mudou = true;
      if (found.custo > 0) {
        result.custo += found.custo;
        result.fontes_consultadas.push("site_scrape");
      }
    }
  }

  result.duracao_ms = Date.now() - t0;
  return result;
}

// ============================================================
// ROUND 1: Google Search via Firecrawl
// ============================================================

async function buscarViaGoogle(query: string, fcKey: string) {
  const out: Partial<EnriquecimentoResult> = { custo: 0 };
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 10 }),
    });
    if (!res.ok) return out;

    const data = await res.json();
    const results: any[] = data?.data || data?.results || [];

    const urls: string[] = [];
    for (const r of results) {
      if (r.url) urls.push(r.url);
      if (r.link) urls.push(r.link);
    }
    const fullText = results
      .map((r) => `${r.url || ""} ${r.title || ""} ${r.description || ""} ${r.markdown || ""}`)
      .join(" ");
    const inlineUrls = fullText.match(/https?:\/\/[^\s)"\]]+/g) || [];
    urls.push(...inlineUrls);

    extractFromUrls(urls, out);
    out.custo = 0.015;
    return out;
  } catch {
    return out;
  }
}

// ============================================================
// ROUND 2: IG profile via ScrapeCreators → bio external_url
// ============================================================

async function buscarViaIG(handle: string, scKey: string, fcKey?: string) {
  const out: Partial<EnriquecimentoResult> = { custo: 0 };
  try {
    const res = await fetch(
      `${SC_BASE}/v1/instagram/profile?handle=${encodeURIComponent(handle)}`,
      { headers: { "x-api-key": scKey } }
    );
    if (!res.ok) return out;

    const json = await res.json();
    const user = json?.data?.user;
    if (!user) return out;

    const externalUrl: string | undefined = user.external_url;
    out.custo = 0.005;

    if (!externalUrl) return out;

    // Resolve redirect (linktree/wa.me etc) pra ver destino real
    const resolved = await resolveDestination(externalUrl);
    if (!resolved) return out;

    const u = resolved;
    const host = (() => {
      try {
        return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        return "";
      }
    })();

    // Se for site próprio, salva url_site (hostname-only) E scrapeia o destino completo
    // Importante: o destino pode ser uma página de "links" (/link, /bio, /links)
    // que tem TODOS os links sociais — não é a home.
    if (
      host &&
      !host.includes("instagram") &&
      !host.includes("facebook") &&
      !host.includes("linkedin") &&
      !host.includes("youtube") &&
      !host.includes("tiktok") &&
      !host.includes("twitter") &&
      !host.includes("linktr.ee") &&
      !host.includes("bio.link") &&
      !host.includes("beacons") &&
      !host.includes("hopp.bio") &&
      !host.includes("solo.to") &&
      !host.includes("about.me")
    ) {
      // wa.me → vira telefone, não site
      if (host.includes("wa.me") || host.includes("api.whatsapp.com")) {
        const m = u.match(/(?:wa\.me|whatsapp\.com\/send\?phone=)\/?(\d+)/);
        if (m) out.telefone = m[1];
      } else {
        try {
          const parsed = new URL(u);
          out.url_site = `${parsed.protocol}//${parsed.hostname}`;
        } catch {
          out.url_site = u;
        }

        // SCRAPEIA o destino COMPLETO via FIRECRAWL (JS rendered).
        // fetch direto não renderiza JS — sites Next.js perdem todos os links sociais.
        if (fcKey) {
          try {
            const fcRes = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
              method: "POST",
              headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ url: u, formats: ["html", "markdown"], waitFor: 2500 }),
            });
            if (fcRes.ok) {
              const data = await fcRes.json();
              const html = data?.data?.html || "";
              const md = data?.data?.markdown || "";
              extractFromText(html + " " + md, out);
              out.custo = (out.custo || 0) + 0.015;
            }
          } catch {
            // ignora
          }
        }
      }
    } else {
      // Caso seja linktree/aggregator → SCRAPA pra achar destinos finais
      // (linktree tem múltiplos links: YouTube, Site, Spotify, WhatsApp, etc)
      const isAggregator =
        host.includes("linktr.ee") ||
        host.includes("bio.link") ||
        host.includes("beacons") ||
        host.includes("hopp.bio") ||
        host.includes("solo.to") ||
        host.includes("about.me") ||
        host.includes("komi.io") ||
        host.includes("linkin.bio");

      if (isAggregator || host.includes("w.app") || host.includes("wa.me")) {
        // Scrape via FIRECRAWL (JS rendered, pega todos os links)
        if (fcKey) {
          try {
            const fcRes = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
              method: "POST",
              headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ url: u, formats: ["html", "markdown"], waitFor: 2500 }),
            });
            if (fcRes.ok) {
              const data = await fcRes.json();
              const html = data?.data?.html || "";
              const md = data?.data?.markdown || "";
              extractFromText(html + " " + md, out);
              out.custo = (out.custo || 0) + 0.015;
            }
          } catch {
            // ignora
          }
        }
      }
    }

    return out;
  } catch {
    return out;
  }
}

async function resolveDestination(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });
    clearTimeout(t);
    return res.url || null;
  } catch {
    return url;
  }
}

// ============================================================
// ROUND 3: Site scrape → regex de redes sociais
// ============================================================

async function buscarViaSite(url: string, fcKey: string) {
  const out: Partial<EnriquecimentoResult> = { custo: 0 };
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["html", "markdown"], waitFor: 1500 }),
    });
    if (!res.ok) return out;

    const data = await res.json();
    const html = data?.data?.html || "";
    const md = data?.data?.markdown || "";
    const allText = html + " " + md;

    extractFromText(allText, out);
    out.custo = 0.015;
    return out;
  } catch {
    return out;
  }
}

// ============================================================
// HELPERS de extração
// ============================================================

function extractFromUrls(urls: string[], out: Partial<EnriquecimentoResult>) {
  for (const raw of urls) {
    const u = raw.replace(/[)\].,;]+$/, "");
    extractSingleUrl(u, out);
  }
}

function extractFromText(text: string, out: Partial<EnriquecimentoResult>) {
  const urls = text.match(/https?:\/\/[^\s)"\]<>]+/g) || [];
  extractFromUrls(urls, out);

  // Telefones BR no HTML
  if (!out.telefone) {
    const phoneMatch = text.match(/wa\.me\/(\d+)/) ||
      text.match(/whatsapp\.com\/send\?phone=(\d+)/);
    if (phoneMatch) out.telefone = phoneMatch[1];
  }
}

// Hosts que NUNCA são "site oficial" do lead — usados pra bloquear lixo
const HOSTS_BLACKLIST = [
  "wikipedia.org",
  "wikidata.org",
  "reddit.com",
  "dictionary.cambridge.org",
  "en.pons.com",
  "pons.com",
  "translate.google.com",
  "duckduckgo.com",
  "bing.com",
  "yahoo.com",
  "ecosia.org",
  "stackoverflow.com",
  "github.com",
  "gitlab.com",
  "globo.com",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
  "msn.com",
  "imdb.com",
  "rotten",
  "spotify.com",
  "soundcloud.com",
  "deezer.com",
  "apple.com/music",
  "music.apple.com",
  "open.spotify.com",
  "discogs.com",
  "letras.mus.br",
  "vagalume.com.br",
  "kboing.com.br",
];

function extractSingleUrl(url: string, out: Partial<EnriquecimentoResult>) {
  // Instagram
  if (!out.instagram_handle) {
    const ig = url.match(/(?:www\.)?instagram\.com\/([a-z0-9_.]+)(?:\/|$|\?)/i);
    if (ig && !["p", "reel", "explore", "tv", "stories", "reels"].includes(ig[1].toLowerCase())) {
      out.instagram_handle = ig[1];
    }
  }
  // Facebook (ignora pixel tracker /tr e endpoints técnicos)
  if (!out.facebook_url) {
    const fb = url.match(/(?:www\.)?facebook\.com\/([a-z0-9.]+)(?:\/|$|\?)/i);
    if (fb) {
      const handle = fb[1].toLowerCase();
      const isTracker = ["tr", "plugins", "v2.0", "v3.0", "sharer", "dialog", "pixel"].includes(handle);
      if (!isTracker && handle.length > 2) {
        out.facebook_url = `https://${fb[0].replace(/[/?]$/, "")}`;
      }
    }
  }
  // LinkedIn
  if (!out.linkedin_url) {
    const li = url.match(/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-z0-9-]+/i);
    if (li) out.linkedin_url = `https://${li[0]}`;
  }
  // YouTube
  if (!out.youtube_url) {
    const yt = url.match(
      /(?:www\.)?youtube\.com\/(?:@[a-z0-9_.-]+|channel\/[a-z0-9_-]+|c\/[a-z0-9_-]+|user\/[a-z0-9_-]+)/i
    );
    if (yt) out.youtube_url = `https://${yt[0]}`;
  }
  // TikTok
  if (!out.tiktok_handle) {
    const tk = url.match(/(?:www\.)?tiktok\.com\/@([a-z0-9_.]+)/i);
    if (tk) out.tiktok_handle = tk[1];
  }
  // Site oficial — primeiro http "limpo" que não seja rede social/aggregator
  if (!out.url_site) {
    const isCommonPlatform =
      /(?:google|instagram|facebook|linkedin|youtube|tiktok|twitter|x\.com|threads|whatsapp|wa\.me|reclameaqui|doctoralia|ifood|tripadvisor|booking|airbnb|amazon|mercadolivre|olx|zap|uber|gstatic|googleusercontent|googleapis|pinterest|maps\.google|linktr\.ee|bio\.link|beacons\.ai|hopp\.bio|solo\.to|about\.me|cdninstagram)/i.test(
        url
      );
    const isAd = /\?gclid=|\?utm_|\?fbclid=/i.test(url);
    const isBlacklisted = HOSTS_BLACKLIST.some((h) => url.toLowerCase().includes(h));
    if (!isCommonPlatform && !isAd && !isBlacklisted && url.startsWith("http") && url.length > 10) {
      try {
        const u = new URL(url);
        out.url_site = `${u.protocol}//${u.hostname}`;
      } catch {
        // ignora
      }
    }
  }
}

// Mescla apenas onde o destino tá vazio. Retorna true se mudou alguma coisa.
function mergeIfEmpty(target: EnriquecimentoResult, src: Partial<EnriquecimentoResult>): boolean {
  let changed = false;
  const fields: (keyof EnriquecimentoResult)[] = [
    "url_site",
    "instagram_handle",
    "facebook_url",
    "linkedin_url",
    "youtube_url",
    "tiktok_handle",
    "telefone",
  ];
  for (const f of fields) {
    if (!target[f] && src[f]) {
      (target as any)[f] = src[f];
      changed = true;
    }
  }
  return changed;
}
