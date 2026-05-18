// Cores base por categoria de produto
const COLORS = {
  blue:   { bg: "bg-blue-100",   text: "text-blue-800",   border: "border-blue-300",   dot: "bg-blue-500" },
  purple: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300", dot: "bg-purple-500" },
  amber:  { bg: "bg-amber-100",  text: "text-amber-800",  border: "border-amber-300",  dot: "bg-amber-500" },
  emerald:{ bg: "bg-emerald-100",text: "text-emerald-800",border: "border-emerald-300",dot: "bg-emerald-500" },
  rose:   { bg: "bg-rose-100",   text: "text-rose-800",   border: "border-rose-300",   dot: "bg-rose-500" },
  cyan:   { bg: "bg-cyan-100",   text: "text-cyan-800",   border: "border-cyan-300",   dot: "bg-cyan-500" },
} as const;

// Mapa de cores fixas por produto — facilita identificação visual no inbox
// Inclui variações de nome para matching flexível
const PRODUCT_COLOR_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "PAIN":            COLORS.blue,
  "ADVISOR IA":      COLORS.purple,
  "Palestra":        COLORS.amber,
  // Variações comuns que podem aparecer nos lead_products
  "Mentoria":        COLORS.emerald,
  "MINHA EMPRESA":   COLORS.rose,
  "Consultoria":     COLORS.cyan,
};

// Cor fallback para produtos novos que ainda não estão mapeados
const FALLBACK_COLOR = {
  bg: "bg-gray-100",
  text: "text-gray-700",
  border: "border-gray-300",
  dot: "bg-gray-500",
};

export function getProductColor(productName: string) {
  // Busca case-insensitive
  const key = Object.keys(PRODUCT_COLOR_MAP).find(
    (k) => k.toLowerCase() === productName.toLowerCase()
  );
  return key ? PRODUCT_COLOR_MAP[key] : FALLBACK_COLOR;
}

export function getAllProductColors() {
  return PRODUCT_COLOR_MAP;
}
