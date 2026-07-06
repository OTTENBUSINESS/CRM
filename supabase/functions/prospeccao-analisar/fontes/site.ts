// Análise PROFUNDA do site oficial
// SEO + UX + Conversão + Pixels + Tech + Forms + Preço + Prova social + Agendamento

const FIRECRAWL_BASE = "https://api.firecrawl.dev";

export interface FonteResult {
  fonte: string;
  ok: boolean;
  score: number | null;
  achados: {
    problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[];
    atencao: { texto: string }[];
    positivos: { texto: string }[];
    metricas?: Record<string, unknown>;
  };
  custo: number;
  duracao_ms: number;
  erro?: string;
  skipped?: string;
}

export async function analisarSite(lead: any, apiKey: string): Promise<FonteResult> {
  const t0 = Date.now();
  if (!lead.url_site) {
    return {
      fonte: "site",
      ok: false,
      score: null,
      achados: { problemas: [], atencao: [], positivos: [] },
      custo: 0,
      duracao_ms: 0,
      skipped: "lead sem site cadastrado",
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
        url: lead.url_site,
        formats: ["markdown", "html"],
        waitFor: 2500,
      }),
    });

    if (!res.ok) {
      return {
        fonte: "site",
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
    const html = (data?.data?.html || "") as string;
    const meta = (data?.data?.metadata || {}) as Record<string, any>;
    const fullText = (md + " " + html).toLowerCase();

    const problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[] = [];
    const atencao: { texto: string }[] = [];
    const positivos: { texto: string }[] = [];

    // ===== SEO BÁSICO =====
    const title = meta.title || meta.ogTitle || "";
    if (!title) {
      problemas.push({ texto: "Sem <title> tag — Google não indexa direito", severidade: "alta" });
    } else if (title.length > 70) {
      problemas.push({
        texto: `Title de ${title.length} caracteres (Google trunca em 60)`,
        severidade: "media",
      });
    } else {
      positivos.push({ texto: "Title bem dimensionado pra SEO" });
    }

    const desc = meta.description || meta.ogDescription || "";
    if (!desc) {
      problemas.push({
        texto: "Sem meta description — perde CTR no Google",
        severidade: "alta",
      });
    } else if (desc.length > 160) {
      atencao.push({ texto: `Meta description longa (${desc.length} chars)` });
    } else {
      positivos.push({ texto: "Meta description configurada" });
    }

    if (fullText.includes("lorem ipsum")) {
      problemas.push({
        texto: "Lorem ipsum visível na página — site inacabado",
        severidade: "alta",
      });
    }

    // ===== INFRA =====
    if (!lead.url_site.startsWith("https")) {
      problemas.push({ texto: "Site sem HTTPS — Chrome marca como inseguro", severidade: "alta" });
    }
    const hasViewport = /viewport/i.test(html);
    if (!hasViewport) {
      problemas.push({
        texto: "Sem meta viewport — site quebra em mobile",
        severidade: "alta",
      });
    }

    // ===== PIXELS / TRACKING =====
    const pixels = detectarPixels(html);
    if (pixels.length === 0) {
      problemas.push({
        texto: "Sem nenhum pixel/analytics detectado — não consegue rastrear conversão nem fazer remarketing",
        severidade: "alta",
      });
    } else {
      positivos.push({
        texto: `Pixels detectados: ${pixels.join(", ")}`,
      });
      // FB Pixel é crítico pra ads
      if (!pixels.includes("Meta Pixel")) {
        atencao.push({
          texto: "Sem Meta Pixel — não consegue criar audiências custom de FB/IG Ads",
        });
      }
      // GA4 é crítico pra dados
      if (!pixels.includes("Google Analytics 4") && !pixels.includes("Google Tag Manager")) {
        atencao.push({ texto: "Sem GA4 nem GTM — operação sem dados de tráfego" });
      }
    }

    // ===== TECH STACK =====
    const techStack = detectarTechStack(html);

    // ===== FORM DE CAPTURA =====
    const formAnalysis = analisarFormulario(html, fullText);
    if (!formAnalysis.has_form && !formAnalysis.has_lead_magnet) {
      problemas.push({
        texto: "Sem formulário de captura nem lead magnet — todo visitante evapora sem virar lead",
        severidade: "alta",
      });
    } else if (formAnalysis.has_form && formAnalysis.has_lead_magnet) {
      positivos.push({ texto: "Tem formulário + lead magnet (estratégia madura)" });
    } else if (formAnalysis.has_form) {
      atencao.push({ texto: "Tem formulário mas sem lead magnet pra incentivar preenchimento" });
    }

    // ===== PREÇO VISÍVEL =====
    const priceAnalysis = analisarPreco(fullText);
    if (!priceAnalysis.tem_preco_visivel) {
      atencao.push({
        texto: "Site não mostra preço — cliente precisa entrar em contato pra saber valor (atrito)",
      });
    } else {
      positivos.push({ texto: "Preço/faixa de valor visível no site" });
    }

    // ===== CTA PRINCIPAL =====
    const ctaAnalysis = analisarCTA(fullText, html);
    if (!ctaAnalysis.tem_cta_principal) {
      problemas.push({
        texto: "Sem CTA claro tipo 'Agende', 'Compre' — site não direciona ação",
        severidade: "media",
      });
    } else {
      positivos.push({ texto: `CTAs detectados: ${ctaAnalysis.ctas.join(", ")}` });
    }

    // ===== PROVA SOCIAL =====
    const socialProof = analisarProvaSocial(fullText, html);
    if (socialProof.score === 0) {
      problemas.push({
        texto: "Sem prova social no site — sem depoimentos, antes/depois, selos ou cases",
        severidade: "media",
      });
    } else if (socialProof.score < 2) {
      atencao.push({
        texto: `Pouca prova social (${socialProof.tipos.join(", ") || "limitada"})`,
      });
    } else {
      positivos.push({ texto: `Boa prova social (${socialProof.tipos.join(", ")})` });
    }

    // ===== WHATSAPP =====
    const waMatch = /(?:wa\.me|api\.whatsapp\.com|whatsapp:\/\/)/i.test(fullText);
    if (!waMatch) {
      problemas.push({
        texto: "Sem link WhatsApp visível — perde lead que quer falar agora",
        severidade: "alta",
      });
    } else {
      positivos.push({ texto: "Link WhatsApp configurado" });
    }

    // ===== AGENDAMENTO ONLINE =====
    const agend = detectarAgendamento(fullText, html);
    if (!agend.tem_agendamento) {
      atencao.push({
        texto: "Sem sistema de agendamento online detectado — cliente depende de horário comercial",
      });
    } else {
      positivos.push({ texto: `Agendamento online: ${agend.sistema}` });
    }

    // ===== PROGRAMA DE INDICAÇÃO =====
    const indic = detectarIndicacao(fullText);
    if (indic.tem_programa) {
      positivos.push({ texto: "Programa de indicação visível" });
    }

    // ===== BLOG / CONTEÚDO SEO =====
    const hasBlog = /\/blog|\/conteudo|\/artigos|\/dicas/i.test(fullText);
    if (!hasBlog) {
      atencao.push({ texto: "Sem blog/conteúdo — perde tráfego orgânico longo prazo" });
    }

    // ===== REDES SOCIAIS LINKADAS =====
    const hasIG = /instagram\.com\/[a-z0-9_.]+/i.test(fullText);
    const hasFB = /facebook\.com\/[a-z0-9.]+/i.test(fullText);
    const hasYT = /youtube\.com\/(?:@|channel\/|c\/)/i.test(fullText);
    const socialLinks = [hasIG && "IG", hasFB && "FB", hasYT && "YT"].filter(Boolean) as string[];
    if (socialLinks.length === 0) {
      atencao.push({ texto: "Sem links pras redes sociais" });
    } else if (socialLinks.length >= 2) {
      positivos.push({ texto: `Integração com ${socialLinks.join("+")}` });
    }

    // ===== OG IMAGE =====
    if (!meta.ogImage) {
      atencao.push({ texto: "Sem og:image — link feio quando compartilha" });
    }

    // ===== SCORE =====
    const penaltyAlta = problemas.filter((p) => p.severidade === "alta").length * 1.5;
    const penaltyMedia = problemas.filter((p) => p.severidade === "media").length * 0.8;
    const penaltyAtencao = atencao.length * 0.3;
    const bonus = Math.min(positivos.length * 0.4, 3.0);
    const score = Math.max(0, Math.min(10, 6 - penaltyAlta - penaltyMedia - penaltyAtencao + bonus));

    return {
      fonte: "site",
      ok: true,
      score: Math.round(score),
      achados: {
        problemas,
        atencao,
        positivos,
        metricas: {
          domain: safeHost(lead.url_site),
          has_https: lead.url_site.startsWith("https"),
          has_viewport: hasViewport,
          has_whatsapp: waMatch,
          title: title.slice(0, 100),
          title_length: title.length,
          description_length: desc.length,
          // Pixels
          pixels_detectados: pixels,
          tem_meta_pixel: pixels.includes("Meta Pixel"),
          tem_ga4: pixels.includes("Google Analytics 4") || pixels.includes("Google Tag Manager"),
          tem_gtm: pixels.includes("Google Tag Manager"),
          // Tech
          tech_stack: techStack,
          // Forms
          has_form: formAnalysis.has_form,
          form_fields: formAnalysis.fields_count,
          has_lead_magnet: formAnalysis.has_lead_magnet,
          lead_magnet_text: formAnalysis.lead_magnet_text,
          // Preço
          tem_preco_visivel: priceAnalysis.tem_preco_visivel,
          precos_detectados: priceAnalysis.precos.slice(0, 5),
          // CTA
          tem_cta_principal: ctaAnalysis.tem_cta_principal,
          ctas_detectados: ctaAnalysis.ctas,
          // Prova social
          prova_social_score: socialProof.score,
          prova_social_tipos: socialProof.tipos,
          // Agendamento
          tem_agendamento_online: agend.tem_agendamento,
          sistema_agendamento: agend.sistema,
          // Indicação
          tem_programa_indicacao: indic.tem_programa,
          // SEO
          tem_blog: hasBlog,
          // Social
          social_links: socialLinks,
        },
      },
      custo: 0.015,
      duracao_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      fonte: "site",
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
// HELPERS — detecções via regex no HTML
// ============================================================

function detectarPixels(html: string): string[] {
  const detected: string[] = [];

  // Meta Pixel
  if (
    /fbq\(|connect\.facebook\.net\/[^/]+\/fbevents\.js|facebook-pixel/i.test(html)
  ) {
    detected.push("Meta Pixel");
  }

  // Google Tag Manager
  if (/GTM-[A-Z0-9]+|googletagmanager\.com\/gtm\.js/i.test(html)) {
    detected.push("Google Tag Manager");
  }

  // GA4
  if (/G-[A-Z0-9]{8,}|gtag\(['"]config['"]/i.test(html)) {
    detected.push("Google Analytics 4");
  }

  // Universal Analytics (legado)
  if (/UA-\d{4,}-\d+|ga\(['"]create['"]/i.test(html) && !detected.includes("Google Analytics 4")) {
    detected.push("Google Analytics (legado UA)");
  }

  // Google Ads
  if (/AW-\d{8,}|google_ads_id/i.test(html)) {
    detected.push("Google Ads");
  }

  // TikTok Pixel
  if (/ttq\.|tiktok-pixel|analytics\.tiktok\.com/i.test(html)) {
    detected.push("TikTok Pixel");
  }

  // LinkedIn Insight
  if (/linkedin_partner_id|snap\.licdn\.com/i.test(html)) {
    detected.push("LinkedIn Insight");
  }

  // Hotjar
  if (/static\.hotjar\.com|_hjSettings/i.test(html)) {
    detected.push("Hotjar");
  }

  // Microsoft Clarity
  if (/clarity\.ms|window\.clarity/i.test(html)) {
    detected.push("Microsoft Clarity");
  }

  // Pinterest
  if (/pintrk\(|pinimg\.com\/ct/i.test(html)) {
    detected.push("Pinterest Tag");
  }

  // RD Station
  if (/rdstation|d335luupugsy2\.cloudfront\.net/i.test(html)) {
    detected.push("RD Station");
  }

  // HubSpot
  if (/js\.hs-scripts\.com|js\.hubspot\.com/i.test(html)) {
    detected.push("HubSpot");
  }

  return [...new Set(detected)];
}

function detectarTechStack(html: string): string[] {
  const stack: string[] = [];

  if (/wp-content|wp-includes/i.test(html)) stack.push("WordPress");
  if (/cdn\.shopify\.com|shopify\.myshopify/i.test(html)) stack.push("Shopify");
  if (/wix\.com|wixstatic\.com/i.test(html)) stack.push("Wix");
  if (/squarespace/i.test(html)) stack.push("Squarespace");
  if (/sites\.google\.com|sgsites/i.test(html)) stack.push("Google Sites");
  if (/elementor/i.test(html)) stack.push("Elementor");
  if (/webflow\.com/i.test(html)) stack.push("Webflow");
  if (/_next\/static|__next/i.test(html)) stack.push("Next.js");
  if (/_nuxt|nuxt-link/i.test(html)) stack.push("Nuxt");
  if (/cdn\.vtex\.|vtex-render/i.test(html)) stack.push("VTEX");
  if (/cdn\.tray\.com\.br/i.test(html)) stack.push("Tray");
  if (/loja\.uol\.com\.br/i.test(html)) stack.push("UOL Loja");
  if (/lojaintegrada/i.test(html)) stack.push("Loja Integrada");

  return stack;
}

function analisarFormulario(html: string, text: string) {
  const formMatches = html.match(/<form[\s\S]*?<\/form>/gi) || [];
  const fields_count = (html.match(/<input(?![^>]*type=["'](?:hidden|submit|button))/gi) || []).length;

  // Lead magnet — palavras-chave
  const leadMagnetWords = [
    "ebook",
    "e-book",
    "baixe grátis",
    "download grátis",
    "guia grátis",
    "checklist",
    "kit grátis",
    "material grátis",
    "free download",
    "newsletter",
    "receba dicas",
    "inscreva-se",
    "cupom de desconto",
  ];
  const matched: string[] = [];
  for (const w of leadMagnetWords) {
    if (text.includes(w)) matched.push(w);
  }

  return {
    has_form: formMatches.length > 0,
    fields_count,
    has_lead_magnet: matched.length > 0,
    lead_magnet_text: matched.slice(0, 3),
  };
}

function analisarPreco(text: string) {
  // Detecta R$ XX,XX ou "XXX reais"
  const matches = text.match(/r\$\s*\d[\d.,]*/gi) || [];
  const reais = text.match(/\d+\s*reais/gi) || [];
  const all = [...matches, ...reais].slice(0, 10);

  return {
    tem_preco_visivel: all.length > 0,
    precos: all,
  };
}

function analisarCTA(text: string, html: string) {
  const ctaPatterns: { pattern: RegExp; label: string }[] = [
    { pattern: /agende|marcar consulta|marque sua/i, label: "agendamento" },
    { pattern: /compre agora|comprar agora|adquirir/i, label: "compra direta" },
    { pattern: /quero saber mais|quero conhecer|saber mais/i, label: "interesse" },
    { pattern: /fale conosco|entre em contato|fale com/i, label: "contato" },
    { pattern: /experimente grátis|teste grátis|free trial/i, label: "trial" },
    { pattern: /reserve sua vaga|garanta sua/i, label: "reserva" },
    { pattern: /baixe agora|download agora/i, label: "download" },
    { pattern: /assine|inscreva-se/i, label: "inscrição" },
  ];
  const ctas: string[] = [];
  for (const { pattern, label } of ctaPatterns) {
    if (pattern.test(text)) ctas.push(label);
  }

  // Verifica se tem botão visualmente proeminente
  const hasButton = /<button|<a[^>]+class=["'][^"']*(?:btn|button|cta)/i.test(html);

  return {
    tem_cta_principal: ctas.length > 0 || hasButton,
    ctas,
    tem_botao_destaque: hasButton,
  };
}

function analisarProvaSocial(text: string, html: string) {
  const tipos: string[] = [];

  if (/depoimento|testimonial|avalia(?:ç|c)(?:ão|oes)|review/i.test(text)) tipos.push("depoimentos");
  if (/antes\s*(?:e|x|\/)\s*depois|before\s*(?:and|&|\/)\s*after/i.test(text)) tipos.push("antes/depois");
  if (/case|estudo de caso|sucesso|resultado/i.test(text)) tipos.push("cases");
  if (/selo|certificado|prêmio|premio|award/i.test(text)) tipos.push("selos");
  if (/parceiro|nossos clientes|empresas que confiam/i.test(text)) tipos.push("parceiros");
  if (/(\d+)\s*(?:clientes|alunos|atendidos|satisfeitos)/i.test(text)) tipos.push("números");
  // Star rating embedado
  if (/(?:★|⭐){3,}/.test(text)) tipos.push("estrelas");

  return { score: tipos.length, tipos };
}

function detectarAgendamento(text: string, html: string) {
  const sistemas: { regex: RegExp; nome: string }[] = [
    { regex: /trinks\.com|booking\.trinks/i, nome: "Trinks" },
    { regex: /booksy\.com/i, nome: "Booksy" },
    { regex: /calendly\.com/i, nome: "Calendly" },
    { regex: /singu\.com/i, nome: "Singu" },
    { regex: /agendor\.com/i, nome: "Agendor" },
    { regex: /clinicaweb|salaomais/i, nome: "Clínica Web/Salão Mais" },
    { regex: /belezaazul/i, nome: "Beleza Azul" },
    { regex: /dr-online|doctoralia/i, nome: "Doctoralia/Dr Online" },
    { regex: /agende online|agendamento online|book.*online/i, nome: "Próprio" },
  ];

  for (const { regex, nome } of sistemas) {
    if (regex.test(text) || regex.test(html)) {
      return { tem_agendamento: true, sistema: nome };
    }
  }

  return { tem_agendamento: false, sistema: null };
}

function detectarIndicacao(text: string) {
  const tem =
    /indique\s*(?:um|uma)\s*amig|programa\s*de\s*indica(?:ç|c)(?:ão|ao)|refer(?:r|i)al\s*program|ganhe\s*por\s*indicar|indique\s*e\s*ganhe/i.test(
      text
    );
  return { tem_programa: tem };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
