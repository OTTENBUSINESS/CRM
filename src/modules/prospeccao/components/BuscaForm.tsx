import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, ArrowRight, Instagram, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileText, ExternalLink } from "lucide-react";
import { useDetectarIntent, useDiagnosticosExistentes, useTemplatesNicho } from "../hooks/useProspeccao";
import { calcularCustoFontes } from "../lib/fontes";
import type { Intent } from "../types";
import { IntentPreview } from "./IntentPreview";
import { FonteToggle } from "./FonteToggle";

const EXEMPLOS = [
  "clínicas de estética em São Paulo",
  "@estetica.perdizes",
  "https://onodera.com.br",
  "dentistas em BH",
  "academias zona sul SP",
  "imobiliárias em Curitiba",
  "lojas de roupa feminina em Floripa",
];

interface Props {
  onSubmit: (params: {
    query: string;
    nicho?: string;
    cidade?: string;
    uf?: string;
    fontes: string[];
    limite: number;
  }) => void;
  onDirect?: (params: { type: "instagram" | "site"; value: string; fontes: string[] }) => void;
  onAbrirAnaliseExistente?: (diagnosticoId: string) => void;
  loading?: boolean;
}

// Auto-detect: Instagram, Site ou Busca
type InputMode = "search" | "instagram" | "site";

interface DetectedInput {
  mode: InputMode;
  value: string;
  display: string;
}

function detectInputType(raw: string): DetectedInput {
  const q = raw.trim();
  if (!q) return { mode: "search", value: "", display: "" };

  // Instagram URL
  const igUrlMatch = q.match(/instagram\.com\/([a-z0-9_.]{2,30})/i);
  if (igUrlMatch) {
    return { mode: "instagram", value: igUrlMatch[1], display: `@${igUrlMatch[1]}` };
  }

  // @handle
  if (/^@[a-z0-9_.]{2,30}$/i.test(q)) {
    return { mode: "instagram", value: q.replace(/^@/, ""), display: q };
  }

  // URL completa
  if (/^https?:\/\//i.test(q)) {
    try {
      const u = new URL(q);
      return { mode: "site", value: q, display: u.hostname.replace(/^www\./, "") };
    } catch {
      // ignore
    }
  }

  // Domínio sem protocolo (ex: "onodera.com.br")
  if (/^[a-z0-9-]+(\.[a-z0-9-]+){1,3}\/?[\w/-]*$/i.test(q) && !q.includes(" ")) {
    return { mode: "site", value: `https://${q}`, display: q.split("/")[0] };
  }

  return { mode: "search", value: q, display: q };
}

// Todas fontes que vamos ativar default no diagnóstico completo
const FONTES_COMPLETO = [
  "contexto_negocio",
  "site",
  "google_maps",
  "google_reviews",
  "instagram",
  "meta_ads",
  "google_ads",
  "posicao_google",
  "pagespeed",
  "facebook",
  "doctoralia",
  "reclame_aqui",
];

export function BuscaForm({ onSubmit, onDirect, onAbrirAnaliseExistente, loading }: Props) {
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [fontes, setFontes] = useState<string[]>(FONTES_COMPLETO);
  const [limite, setLimite] = useState(20);
  const [exemploIdx, setExemploIdx] = useState(0);
  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutateAsync: detectar, isPending: detectando } = useDetectarIntent();
  const { data: templates } = useTemplatesNicho();

  // Auto-detect tipo de input
  const detectedInput = useMemo(() => detectInputType(query), [query]);
  const isDirect = detectedInput.mode !== "search";

  // Busca análises existentes pra esse handle/site
  const { data: existentes = [] } = useDiagnosticosExistentes(
    isDirect ? (detectedInput.mode as "instagram" | "site") : null,
    detectedInput.value
  );

  // Roteia exemplos no placeholder
  useEffect(() => {
    if (query) return;
    const t = setInterval(() => setExemploIdx((i) => (i + 1) % EXEMPLOS.length), 3500);
    return () => clearInterval(t);
  }, [query]);

  // Detecta intent com debounce 600ms — só pra modo busca
  useEffect(() => {
    if (detectTimer.current) clearTimeout(detectTimer.current);
    if (isDirect) {
      // Modo direto não chama Gemini — apenas limpa intent
      setIntent(null);
      return;
    }
    if (query.trim().length < 6) {
      setIntent(null);
      return;
    }
    detectTimer.current = setTimeout(async () => {
      try {
        const { intent: result } = await detectar(query.trim());
        setIntent(result);
        // Default = completo + sugestões IA + obrigatórias do nicho
        const template = templates?.find((t) => t.nicho === result.nicho);
        const merged = [
          ...new Set([
            ...FONTES_COMPLETO,
            ...(template?.fontes_obrigatorias || []),
            ...(result.fontes_sugeridas || []),
          ]),
        ];
        setFontes(merged);
      } catch {
        // silencioso
      }
    }, 600);
    return () => {
      if (detectTimer.current) clearTimeout(detectTimer.current);
    };
  }, [query, detectar, templates, isDirect]);

  const obrigatorias = intent
    ? templates?.find((t) => t.nicho === intent.nicho)?.fontes_obrigatorias || []
    : [];

  const custoListagem = 0.015;
  const custoAnaliseUnit = calcularCustoFontes(fontes);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (isDirect && onDirect) {
      onDirect({
        type: detectedInput.mode as "instagram" | "site",
        value: detectedInput.value,
        fontes,
      });
      return;
    }

    onSubmit({
      query: query.trim(),
      nicho: intent?.nicho,
      cidade: intent?.cidade || undefined,
      uf: intent?.uf || undefined,
      fontes,
      limite,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Hero input */}
      <div className="space-y-3">
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={detectedInput.mode}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
            >
              {detectedInput.mode === "instagram" ? (
                <Instagram className="h-5 w-5 text-pink-500" />
              ) : detectedInput.mode === "site" ? (
                <Globe className="h-5 w-5 text-sky-500" />
              ) : (
                <Search className="h-5 w-5 text-muted-foreground" />
              )}
            </motion.div>
          </AnimatePresence>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={EXEMPLOS[exemploIdx]}
            className={`h-14 pl-12 pr-4 text-base bg-background border-border focus-visible:ring-offset-0 transition-all ${
              detectedInput.mode === "instagram"
                ? "focus-visible:ring-pink-500/40 border-pink-500/30"
                : detectedInput.mode === "site"
                ? "focus-visible:ring-sky-500/40 border-sky-500/30"
                : "focus-visible:ring-primary/40"
            }`}
            autoFocus
          />
        </div>

        <AnimatePresence mode="wait">
          {detectedInput.mode === "instagram" ? (
            <motion.p
              key="ig"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-pink-500 flex items-center gap-1.5"
            >
              <Instagram className="h-3 w-3" />
              <span>
                Modo direto · vou analisar <strong>{detectedInput.display}</strong> sem buscar no Maps
              </span>
            </motion.p>
          ) : detectedInput.mode === "site" ? (
            <motion.p
              key="site"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-sky-500 flex items-center gap-1.5"
            >
              <Globe className="h-3 w-3" />
              <span>
                Modo direto · vou analisar <strong>{detectedInput.display}</strong> sem buscar no Maps
              </span>
            </motion.p>
          ) : (
            <motion.p
              key="search"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-muted-foreground"
            >
              💡 Digite livre, cole um <strong>@username</strong> ou uma <strong>URL</strong>. A IA detecta o que fazer.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Análise existente — modo direto */}
      <AnimatePresence>
        {isDirect && existentes.length > 0 && (
          <motion.div
            key="existentes"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4"
          >
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  Já tem análise feita pra <strong>{detectedInput.display}</strong>
                </p>
                <div className="mt-2 space-y-1">
                  {existentes.slice(0, 3).map((d) => (
                    <button
                      key={d.diagnostico_id}
                      type="button"
                      onClick={() => onAbrirAnaliseExistente?.(d.diagnostico_id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-emerald-500/20 bg-background/40 px-3 py-2 text-left text-xs hover:border-emerald-500/40 hover:bg-background/60 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate max-w-[260px]">{d.lead_nome}</span>
                        {d.score_geral !== null && (
                          <span className="font-bold text-emerald-500">
                            {Number(d.score_geral).toFixed(1)}/10
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          · {new Date(d.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-500">
                        Abrir
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Você pode abrir uma análise existente acima ou seguir clicando em <strong>Analisar agora</strong> pra fazer uma nova.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Intent detected */}
      {(detectando || intent) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="rounded-lg border border-border/60 bg-card/30 p-4"
        >
          <IntentPreview
            intent={intent || ({} as Intent)}
            detecting={detectando}
            onEdit={() => {
              /* TODO: modal editar manual nicho/cidade */
            }}
          />
        </motion.div>
      )}

      {/* Fontes a raspar — aparece pra modo direto E modo busca (após intent) */}
      {(intent || isDirect) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              📡 Fontes que vou raspar na análise
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {fontes.length} ativa{fontes.length !== 1 ? "s" : ""}
            </span>
          </div>
          <FonteToggle
            selecionadas={fontes}
            obrigatorias={obrigatorias}
            onChange={setFontes}
          />
          <p className="text-[11px] text-muted-foreground">
            Custo da listagem agora: <strong className="text-foreground">R$ {(custoListagem * 5.5).toFixed(2)}</strong>
            <span className="mx-1.5 opacity-50">·</span>
            Análise completa depois:{" "}
            <strong className="text-foreground">R$ {(custoAnaliseUnit * 5.5).toFixed(2)}</strong> por lead escolhido
          </p>
        </motion.div>
      )}

      {/* Quantidade + submit */}
      <div className="flex items-center justify-between gap-4 pt-2">
        {!isDirect ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Quantos leads?</span>
            <select
              value={limite}
              onChange={(e) => setLimite(Number(e.target.value))}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </label>
        ) : (
          <span className="text-xs text-muted-foreground">
            Vou direto pra análise — sem etapa de descoberta
          </span>
        )}

        <Button
          type="submit"
          disabled={!query.trim() || loading}
          size="lg"
          className="gap-2 px-8"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isDirect ? "Criando lead…" : "Buscando…"}
            </>
          ) : isDirect ? (
            <>
              {detectedInput.mode === "instagram" ? (
                <Instagram className="h-4 w-4" />
              ) : (
                <Globe className="h-4 w-4" />
              )}
              Analisar agora
              <ArrowRight className="h-4 w-4" />
            </>
          ) : (
            <>
              Buscar {limite} leads
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
