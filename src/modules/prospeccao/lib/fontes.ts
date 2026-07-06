// ============================================================
// Catálogo de fontes — UI labels, ícones, custos
// (Fontes que serão raspadas na fase de ANÁLISE — fase 2)
// ============================================================

export interface FonteCatalogo {
  id: string;
  label: string;
  emoji: string;
  api: "firecrawl" | "scrapecreators" | "rapidapi" | "interno";
  custo_unitario: number;
  descricao: string;
  obrigatoria_em?: string[]; // nichos onde é obrigatória
}

export const CATALOGO_FONTES: FonteCatalogo[] = [
  // ----- Contexto (a primeira a olhar) -----
  {
    id: "contexto_negocio",
    label: "Contexto do Negócio",
    emoji: "🧠",
    api: "interno",
    custo_unitario: 0.017,
    descricao: "Lê o site e identifica: o que vende, posicionamento, público, preços, diferenciais",
  },
  // ----- Maps & Reviews -----
  {
    id: "google_maps",
    label: "Google Maps",
    emoji: "🗺️",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Endereço, telefone, nota, reviews",
    obrigatoria_em: ["saude", "estetica", "restaurante", "comercio_local", "imobiliaria", "hospedagem"],
  },
  {
    id: "google_reviews",
    label: "Google Reviews",
    emoji: "⭐",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Reviews completos com texto",
  },

  // ----- Site -----
  {
    id: "site",
    label: "Site oficial",
    emoji: "🌐",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "SEO, conversão, bugs, WhatsApp link",
  },

  // ----- Redes sociais -----
  {
    id: "instagram",
    label: "Instagram",
    emoji: "📸",
    api: "rapidapi",
    custo_unitario: 0.005,
    descricao: "Bio, posts, followers, ratio",
  },
  {
    id: "facebook",
    label: "Facebook",
    emoji: "👥",
    api: "scrapecreators",
    custo_unitario: 0.01,
    descricao: "Página, ads, services",
  },
  {
    id: "linkedin_company",
    label: "LinkedIn (empresa)",
    emoji: "💼",
    api: "scrapecreators",
    custo_unitario: 0.01,
    descricao: "Headcount, growth, indústria",
  },
  {
    id: "linkedin_founder",
    label: "LinkedIn (fundador)",
    emoji: "👤",
    api: "scrapecreators",
    custo_unitario: 0.01,
    descricao: "Cargo, histórico, posts",
  },
  {
    id: "youtube",
    label: "YouTube",
    emoji: "📺",
    api: "scrapecreators",
    custo_unitario: 0.01,
    descricao: "Subs, views, conteúdo",
  },
  {
    id: "tiktok",
    label: "TikTok",
    emoji: "🎵",
    api: "scrapecreators",
    custo_unitario: 0.01,
    descricao: "Followers, vídeos, engajamento",
  },
  {
    id: "twitter",
    label: "Twitter/X",
    emoji: "🐦",
    api: "scrapecreators",
    custo_unitario: 0.01,
    descricao: "Tweets, métricas",
  },

  // ----- Reputação -----
  {
    id: "reclame_aqui",
    label: "Reclame Aqui",
    emoji: "😡",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Reclamações + score reputação",
  },
  {
    id: "doctoralia",
    label: "Doctoralia",
    emoji: "🩺",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Avaliações médicas",
  },
  {
    id: "glassdoor",
    label: "Glassdoor",
    emoji: "🏢",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Avaliação interna empresa",
  },

  // ----- Marketplaces / Delivery -----
  {
    id: "ifood",
    label: "iFood",
    emoji: "🍔",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Cardápio, nota, popularidade",
  },
  {
    id: "tripadvisor",
    label: "TripAdvisor",
    emoji: "✈️",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Reviews turismo / restaurante",
  },
  {
    id: "booking",
    label: "Booking",
    emoji: "🛏️",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Hospedagem, reviews",
  },
  {
    id: "airbnb",
    label: "Airbnb",
    emoji: "🏡",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Hospedagem alt",
  },
  {
    id: "mercado_livre",
    label: "Mercado Livre",
    emoji: "🛒",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Loja, reputação, vendas",
  },
  {
    id: "zap",
    label: "Zap Imóveis",
    emoji: "🏠",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Imóveis cadastrados",
  },
  {
    id: "olx",
    label: "OLX",
    emoji: "📦",
    api: "firecrawl",
    custo_unitario: 0.015,
    descricao: "Anúncios diversos",
  },

  // ----- Anúncios pagos / espionagem -----
  {
    id: "meta_ads",
    label: "Meta Ads (FB/IG)",
    emoji: "📱",
    api: "scrapecreators",
    custo_unitario: 0.01,
    descricao: "Anúncios ativos no Facebook + Instagram (Meta Ad Library)",
  },
  {
    id: "google_ads",
    label: "Google Ads",
    emoji: "🎯",
    api: "scrapecreators",
    custo_unitario: 0.01,
    descricao: "Anúncios Search/Display ativos no Google",
  },
  {
    id: "linkedin_founder",
    label: "LinkedIn (fundador)",
    emoji: "👤",
    api: "scrapecreators",
    custo_unitario: 0.01,
    descricao: "Perfil pessoal do fundador (autoridade B2B)",
  },
  {
    id: "posicao_google",
    label: "Posição Google",
    emoji: "🔍",
    api: "firecrawl",
    custo_unitario: 0.005,
    descricao: 'Posição em "[nicho] [cidade]" + concorrentes top',
  },
  {
    id: "pagespeed",
    label: "PageSpeed (Core Web Vitals)",
    emoji: "⚡",
    api: "interno",
    custo_unitario: 0,
    descricao: "Performance mobile/desktop, LCP, CLS — Google API",
  },
];

export const FONTES_BY_ID = Object.fromEntries(CATALOGO_FONTES.map((f) => [f.id, f]));

export function fonteLabel(id: string): string {
  return FONTES_BY_ID[id]?.label || id;
}

export function fonteEmoji(id: string): string {
  return FONTES_BY_ID[id]?.emoji || "🔌";
}

export function calcularCustoFontes(fontes: string[]): number {
  return fontes.reduce((acc, id) => acc + (FONTES_BY_ID[id]?.custo_unitario || 0), 0);
}
