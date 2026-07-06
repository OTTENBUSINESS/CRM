import { motion } from "framer-motion";
import { MapPin, Phone, Globe, Star, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { LeadDescoberto } from "../types";

interface Props {
  lead: LeadDescoberto;
  selecionado: boolean;
  onToggle: () => void;
  diagnosticoId?: string | null;
  scoreGeral?: number | null;
  onAbrirDiagnostico?: () => void;
}

export function LeadDescobertoCard({
  lead,
  selecionado,
  onToggle,
  diagnosticoId,
  scoreGeral,
  onAbrirDiagnostico,
}: Props) {
  const nota = lead.nota_google;
  const reviewsCount = lead.qtd_avaliacoes ?? 0;

  // Indicador de "dor" — lead com nota baixa = mais propenso a comprar IA
  const dorLevel = nota === null ? "unknown" : nota < 3.5 ? "high" : nota < 4.3 ? "medium" : "low";
  const jaAnalisado = !!diagnosticoId;

  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={() => {
        if (jaAnalisado && onAbrirDiagnostico) {
          onAbrirDiagnostico();
        } else {
          onToggle();
        }
      }}
      className={`group cursor-pointer rounded-xl border bg-card p-4 transition-all ${
        jaAnalisado
          ? "border-emerald-500/40 hover:border-emerald-500/60"
          : selecionado
          ? "border-primary/60 ring-1 ring-primary/30 shadow-[0_0_20px_-8px_hsl(var(--primary)/0.4)]"
          : "border-border hover:border-foreground/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
          {jaAnalisado ? (
            <div className="flex h-4 w-4 items-center justify-center rounded-sm bg-emerald-500 text-white">
              <FileText className="h-2.5 w-2.5" />
            </div>
          ) : (
            <Checkbox checked={selecionado} onCheckedChange={onToggle} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{lead.nome}</h3>
              {lead.categoria && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                  {lead.categoria}
                </p>
              )}
            </div>

            {/* Score Maps */}
            {nota !== null && (
              <div className="flex flex-col items-end shrink-0">
                <div className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-bold text-foreground">{nota.toFixed(1)}</span>
                </div>
                {reviewsCount > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {reviewsCount.toLocaleString("pt-BR")} reviews
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Linha de info */}
          <div className="mt-2 space-y-1">
            {lead.endereco && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground line-clamp-1">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{lead.endereco}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {lead.telefone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {formatPhone(lead.telefone)}
                </span>
              )}
              {lead.url_site && (
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  <span className="max-w-[160px] truncate">{cleanDomain(lead.url_site)}</span>
                </span>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <DorBadge level={dorLevel} />
              {jaAnalisado && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                  <FileText className="h-3 w-3" />
                  Analisado
                  {scoreGeral !== null && scoreGeral !== undefined && (
                    <span className="font-bold">· {Number(scoreGeral).toFixed(1)}/10</span>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {jaAnalisado && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
                  Ver diagnóstico
                  <ExternalLink className="h-3 w-3" />
                </span>
              )}
              {lead.url_maps && !jaAnalisado && (
                <a
                  href={lead.url_maps}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Ver no Maps <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DorBadge({ level }: { level: "high" | "medium" | "low" | "unknown" }) {
  const map = {
    high: { label: "🔥 Alta dor", cls: "bg-rose-500/10 text-rose-500 border-rose-500/30" },
    medium: { label: "🟡 Média dor", cls: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
    low: { label: "🟢 Pouca dor", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
    unknown: {
      label: "❓ Sem dados",
      cls: "bg-muted text-muted-foreground border-border",
    },
  } as const;
  const { label, cls } = map[level];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

function cleanDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
