import { motion } from "framer-motion";
import { Sparkles, TrendingUp } from "lucide-react";
import type { Oportunidade } from "../types";

interface Props {
  oportunidade: Oportunidade;
  index: number;
}

export function OportunidadeCard({ oportunidade, index }: Props) {
  const prioridadeCfg = {
    alta: {
      label: "🔥 Prioridade alta",
      cls: "bg-rose-500/10 text-rose-500 border-rose-500/30",
    },
    media: {
      label: "🟡 Média",
      cls: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    },
    baixa: {
      label: "🟢 Baixa",
      cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    },
  }[oportunidade.prioridade];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="group rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-foreground leading-snug">
              {index + 1}. {oportunidade.titulo}
            </h3>
            {prioridadeCfg && (
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${prioridadeCfg.cls}`}
              >
                {prioridadeCfg.label}
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            {oportunidade.descricao}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {oportunidade.impacto_estimado && (
              <div className="inline-flex items-center gap-1.5 text-xs">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-foreground/90 font-medium">
                  {oportunidade.impacto_estimado}
                </span>
              </div>
            )}
            {oportunidade.produto_sugerido && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {oportunidade.produto_sugerido}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
