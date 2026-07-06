import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, AlertCircle, ThumbsUp, AlertTriangle, Clock } from "lucide-react";
import { fonteEmoji, fonteLabel } from "../lib/fontes";
import type { AchadosCanal } from "../types";

interface Props {
  fonte: string;
  score: number | null;
  achados?: AchadosCanal | null;
  status: "ok" | "falhou" | "pendente";
  fontesImplementadas?: string[];
}

const FONTES_IMPLEMENTADAS_DEFAULT = [
  "contexto_negocio",
  "site",
  "google_maps",
  "google_reviews",
  "instagram",
  "doctoralia",
  "reclame_aqui",
  "facebook",
  "linkedin_company",
  "linkedin_founder",
  "youtube",
  "ifood",
  "tiktok",
  "tripadvisor",
  "mercado_livre",
  "glassdoor",
  "meta_ads",
  "google_ads",
  "fb_ad_library",
  "google_ad_library",
  "posicao_google",
  "pagespeed",
];

export function CanalScoreRow({
  fonte,
  score,
  achados,
  status,
  fontesImplementadas = FONTES_IMPLEMENTADAS_DEFAULT,
}: Props) {
  const [open, setOpen] = useState(false);
  const totalAchados =
    (achados?.problemas?.length || 0) +
    (achados?.atencao?.length || 0) +
    (achados?.positivos?.length || 0);

  const expandivel = status === "ok" && totalAchados > 0;
  const naoImplementada = !fontesImplementadas.includes(fonte);

  // Pega 1 problema-chave pra mostrar inline
  const problemaChave =
    achados?.problemas?.find((p) => p.severidade === "alta") ||
    achados?.problemas?.[0] ||
    achados?.atencao?.[0];

  const scoreColor =
    score === null
      ? "text-muted-foreground"
      : score < 4
      ? "text-rose-500"
      : score < 7
      ? "text-amber-500"
      : "text-emerald-500";

  const dotColor =
    score === null
      ? "bg-muted"
      : score < 4
      ? "bg-rose-500"
      : score < 7
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <motion.div
      layout
      className="rounded-xl border border-border/60 bg-card/30 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => expandivel && setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 ${
          expandivel ? "cursor-pointer hover:bg-card/60" : "cursor-default"
        } transition-colors text-left`}
      >
        <span className="text-lg leading-none">{fonteEmoji(fonte)}</span>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm">{fonteLabel(fonte)}</p>
          {status === "pendente" ? (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              {naoImplementada
                ? "⏳ fonte em breve (sem implementação ainda)"
                : achados?.skipped_reason
                ? `↪ ${achados.skipped_reason}`
                : "↪ sem dado pra raspar"}
            </p>
          ) : status === "falhou" ? (
            <p className="text-[11px] text-rose-500/80 mt-0.5">
              ⚠️ {achados?.erro || "falhou ao raspar"}
            </p>
          ) : problemaChave ? (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {problemaChave.texto}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">sem problemas detectados</p>
          )}
        </div>

        {/* Score */}
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          {score !== null ? (
            <span className={`font-bold ${scoreColor}`}>
              {score}
              <span className="text-xs text-muted-foreground/70">/10</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {expandivel && (
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          )}
        </div>
      </button>

      {/* Detalhes expansíveis */}
      <AnimatePresence>
        {open && expandivel && achados && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 bg-background/40 px-4 py-3 space-y-3">
              {achados.problemas && achados.problemas.length > 0 && (
                <Section title="Problemas críticos" icon="problemas">
                  {achados.problemas.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-rose-500 mt-0.5">•</span>
                      <span className="text-foreground/90 flex-1">{p.texto}</span>
                      {p.severidade === "alta" && (
                        <span className="text-[10px] uppercase tracking-wider text-rose-500/70">
                          alta
                        </span>
                      )}
                    </li>
                  ))}
                </Section>
              )}

              {achados.atencao && achados.atencao.length > 0 && (
                <Section title="Atenção" icon="atencao">
                  {achados.atencao.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span className="text-foreground/85">{a.texto}</span>
                    </li>
                  ))}
                </Section>
              )}

              {achados.positivos && achados.positivos.length > 0 && (
                <Section title="Pontos positivos" icon="positivos">
                  {achados.positivos.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-emerald-500 mt-0.5">•</span>
                      <span className="text-foreground/85">{p.texto}</span>
                    </li>
                  ))}
                </Section>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: "problemas" | "atencao" | "positivos";
  children: React.ReactNode;
}) {
  const cfg = {
    problemas: { Icon: AlertCircle, color: "text-rose-500" },
    atencao: { Icon: AlertTriangle, color: "text-amber-500" },
    positivos: { Icon: ThumbsUp, color: "text-emerald-500" },
  }[icon];

  return (
    <div>
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${cfg.color} mb-1.5`}>
        <cfg.Icon className="h-3 w-3" />
        {title}
      </div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}
