// Parser do markdown do Google Maps retornado pelo Firecrawl
// Extrai blocos de negócios estruturados

export interface ParsedLead {
  nome: string;
  categoria?: string;
  telefone?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  url_maps?: string;
  url_site?: string;
  nota_google?: number;
  qtd_avaliacoes?: number;
  faixa_preco?: string;
}

const MAPS_PLACE_REGEX =
  /\[([^\]\n]{2,150})\]\((https?:\/\/(?:www\.)?google\.com\/maps\/place\/[^\s)]+)\)/g;

export function parseGoogleMapsMarkdown(markdown: string): ParsedLead[] {
  const leads: ParsedLead[] = [];
  const seen = new Set<string>();

  // 1. Acha todas as ocorrências de "[Nome](url do place)"
  const matches: { nome: string; url: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  const reExec = new RegExp(MAPS_PLACE_REGEX.source, "g");
  while ((m = reExec.exec(markdown)) !== null) {
    matches.push({ nome: m[1].trim(), url: m[2], index: m.index });
  }

  if (matches.length === 0) return leads;

  // 2. Pra cada match, pega o "bloco" até o próximo (ou +1500 chars)
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const endIdx = next ? next.index : Math.min(cur.index + 1800, markdown.length);
    const bloco = markdown.substring(cur.index, endIdx);

    // Dedup pelo URL do place
    const key = cur.url;
    if (seen.has(key)) continue;
    seen.add(key);

    // Filtros básicos: nome muito curto ou parece header de menu
    if (cur.nome.length < 3) continue;
    const lowerName = cur.nome.toLowerCase();
    if (
      lowerName.includes("ver mais") ||
      lowerName.includes("see more") ||
      lowerName.includes("filter") ||
      lowerName === "google" ||
      lowerName === "maps"
    )
      continue;

    // 3. Extrai dados
    const lead: ParsedLead = {
      nome: cleanName(cur.nome),
      url_maps: cur.url,
    };

    // Nota — formato típico: "4.7\n(245)" ou "★ 4.5 (123)"
    const ratingMatch =
      bloco.match(/\b(\d\.\d)\s*\n*\s*\(([\d.,]+)\)/) ||
      bloco.match(/(?:★|⭐)\s*(\d\.\d)\s*\(([\d.,]+)\)/);
    if (ratingMatch) {
      lead.nota_google = parseFloat(ratingMatch[1]);
      lead.qtd_avaliacoes = parseInt(ratingMatch[2].replace(/[.,]/g, ""), 10);
    } else {
      // Só nota sem reviews
      const onlyRating = bloco.match(/\n(\d\.\d)\n/);
      if (onlyRating) lead.nota_google = parseFloat(onlyRating[1]);
    }

    // Categoria — texto após nota antes de "·"
    const catMatch = bloco.match(
      /(?:Beauty salon|Hair salon|Spa|Restaurant|Dental clinic|Dentist|Doctor|Gym|Hotel|Bar|Cafe|Café|Pharmacy|Bakery|Pet shop|Repair|Clinic|Clínica|Dentista|Médico|Salão|Padaria|Restaurante|Hotel|Pousada|Esteticista|Estética|Loja|Pizzaria|Lanchonete|Hamburgueria|Confeitaria|Barbearia|Academia|Veterinário|Pet|Imobiliária|Construtora|Studio|Atelier|Spa)[a-záéíóúãõçâêô\s/-]*/i
    );
    if (catMatch) lead.categoria = catMatch[0].trim().replace(/\s+/g, " ");

    // Endereço — "Av X, 123" / "R. X, 45" / "Rua X" / "Rod X"
    const enderecoMatch =
      bloco.match(
        /·\s*((?:Av|Avenida|R\.?|Rua|Rod\.?|Rodovia|Praça|Pç|Tv\.?|Travessa|Estrada|Estr\.?|Alameda|Al\.?)[^·\n]+?)(?:\s*·|\n|$)/i
      ) ||
      bloco.match(
        /\b((?:Av|Avenida|R\.?|Rua|Rod\.?|Rodovia|Praça|Pç|Tv\.?|Travessa|Estrada|Estr\.?|Alameda|Al\.?)\.?\s+[^,\n]+,\s*\d+[^\n]*)/i
      );
    if (enderecoMatch) {
      lead.endereco = enderecoMatch[1].trim().replace(/\s+/g, " ").substring(0, 200);
    }

    // Telefone BR — (XX) XXXXX-XXXX ou +55 XX XXXXX-XXXX
    const telMatch = bloco.match(/\(?\+?\s*\d{2,3}\)?\s*\d{4,5}[\s-]?\d{4}/);
    if (telMatch) lead.telefone = normalizePhone(telMatch[0]);

    // Site — "[Website](url)" ou link http direto
    const siteMatch =
      bloco.match(/\[(?:Website|Site|Link)\]\((https?:\/\/[^)]+)\)/i) ||
      bloco.match(/(https?:\/\/(?!(?:www\.)?(?:google|gstatic|googleusercontent))\S+)/);
    if (siteMatch) lead.url_site = cleanUrl(siteMatch[1]);

    // Faixa preço — $$ / $$$
    const priceMatch = bloco.match(/[·\s](\$+)\s*(?:·|\n)/);
    if (priceMatch) lead.faixa_preco = priceMatch[1];

    leads.push(lead);
  }

  return leads;
}

function cleanName(name: string): string {
  let n = name
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Maps anexa serviços ao nome via vírgula. Ex:
  //   "Pró Estética Vila Mariana, Ultraformer, Fotona, Botox..."
  // Pega só a parte antes da primeira vírgula se o restante for muito longo
  const idx = n.indexOf(",");
  if (idx > 0 && n.length - idx > 20) {
    n = n.substring(0, idx).trim();
  }
  return n;
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

function cleanUrl(url: string): string {
  // Remove trailing pontuação que vaza do markdown
  return url.replace(/[)\].,;]+$/, "").trim();
}
