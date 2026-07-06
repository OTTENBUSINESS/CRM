// ============================================================
// extract_phone — extrai telefone BR de qualquer string/objeto
// ============================================================
// Cobre formatos:
//   (11) 99999-9999  | (11) 9999-9999
//   11 99999-9999    | 11 9999-9999
//   +55 11 99999-9999
//   wa.me/5511999999999
//   api.whatsapp.com/send?phone=...
//   11999999999 (raw)

const PATTERNS: RegExp[] = [
  // wa.me / whatsapp link com phone (prioridade — link explícito)
  /wa\.me\/(\d{10,13})/i,
  /api\.whatsapp\.com\/send\?phone=(\d{10,13})/i,
  /whatsapp\.com\/(\d{10,13})/i,
  // +55 com DDD (internacional)
  /\+?55\s?[\(\[]?(\d{2})[\)\]]?\s?(\d{4,5})[-.\s]?(\d{4})/,
  // (DDD) número
  /[\(\[](\d{2})[\)\]]\s?(\d{4,5})[-.\s]?(\d{4})/,
  // DDD número (com espaço/hífen)
  /(?:^|[^\d])(\d{2})\s?(\d{4,5})[-.\s](\d{4})(?!\d)/,
  // 11 dígitos crus (DDD+9+8 dígitos)
  /(?:^|[^\d])(\d{2})(\d{5})(\d{4})(?!\d)/,
];

function normalize(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  // Remove +55 inicial se tem
  let d = digits;
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  // Valida DDD razoável (11-99)
  const ddd = parseInt(d.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return null;
  // Brasil: 13 dígitos canônico = 55+DDD+9+8 (Anatel)
  if (d.length === 10) {
    // fixo OU móvel sem 9 — preserva
    return `55${d}`;
  }
  // 11 dígitos = DDD+9+8 (móvel)
  return `55${d}`;
}

export function extractPhoneFromText(text: string | undefined | null): string | null {
  if (!text) return null;
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    // Match[1] em wa.me / whatsapp = phone bruto
    if (m[0].toLowerCase().includes("wa.me") || m[0].toLowerCase().includes("whatsapp")) {
      const norm = normalize(m[1]);
      if (norm) return norm;
      continue;
    }
    // Caso DDD + parts
    const parts = m.slice(1).filter(Boolean).join("");
    const norm = normalize(parts);
    if (norm) return norm;
  }
  return null;
}

// Recursivo — raspa todas as strings de um objeto JSON
export function extractPhoneFromAny(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return extractPhoneFromText(value);
  if (typeof value === "number") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const p = extractPhoneFromAny(item);
      if (p) return p;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const p = extractPhoneFromAny(v);
      if (p) return p;
    }
  }
  return null;
}

// Tenta extrair de várias fontes ordenadas por confiança
export function extractPhoneFromAchados(achados: Record<string, unknown>): {
  phone: string | null;
  fonte: string | null;
} {
  // Ordem: maps > whatsapp link > site > IG > FB > contexto > resto
  const ordem: Array<[string, unknown]> = [
    ["google_maps", achados.google_maps],
    ["site", achados.site],
    ["instagram", achados.instagram],
    ["facebook", achados.facebook],
    ["doctoralia", achados.doctoralia],
    ["contexto_negocio", achados.contexto_negocio],
    ["linkedin_company", achados.linkedin_company],
  ];
  for (const [fonte, val] of ordem) {
    const p = extractPhoneFromAny(val);
    if (p) return { phone: p, fonte };
  }
  return { phone: null, fonte: null };
}
