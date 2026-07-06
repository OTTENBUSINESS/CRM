import { motion } from "framer-motion";
import { Flame, AlertTriangle, ThumbsUp } from "lucide-react";

interface Props {
  scoreGeral: number;
  resumo?: string | null;
  totalCusto?: number;
  duracaoMs?: number | null;
}

export function ScoreGeralCard({ scoreGeral, resumo, totalCusto, duracaoMs }: Props) {
  // Faixas — score baixo = ALTA DOR = lead bom
  const tier = scoreGeral < 4 ? "alta_dor" : scoreGeral < 7 ? "media_dor" : "pouca_dor";

  const config = {
    alta_dor: {
      label: "ALTA DOR — LEAD QUENTE",
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      border: "border-rose-500/30",
      bar: "bg-rose-500",
      Icon: Flame,
      caption: "Muito problema = muita propensão a comprar IA. Vai com tudo.",
    },
    media_dor: {
      label: "MÉDIA DOR — VALE A PENA",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      bar: "bg-amber-500",
      Icon: AlertTriangle,
      caption: "Tem espaço pra melhorar. Foque na maior oportunidade.",
    },
    pouca_dor: {
      label: "POUCA DOR — LEAD DIFÍCIL",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      bar: "bg-emerald-500",
      Icon: ThumbsUp,
      caption: "Já tá redondo. Convencer aqui dá mais trabalho.",
    },
  }[tier];

  const widthPct = Math.max(5, Math.min(100, (scoreGeral / 10) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border ${config.border} ${config.bg} p-5 lg:p-6`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className={`inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider ${config.color}`}>
            <config.Icon className="h-3.5 w-3.5" />
            {config.label}
          </div>
          <p className="mt-3 text-sm text-foreground/90 max-w-md leading-relaxed">
            {resumo || config.caption}
          </p>
        </div>

        <div className="text-right">
          <div className="flex items-baseline gap-1">
            <span className={`text-5xl font-bold tracking-tight ${config.color}`}>
              {scoreGeral.toFixed(1)}
            </span>
            <span className="text-xl text-muted-foreground">/10</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Score geral</p>
        </div>
      </div>

      {/* Barra animada */}
      <div className="mt-5 h-2 rounded-full bg-foreground/5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${widthPct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full ${config.bar}`}
        />
      </div>

      {/* Footer metadata */}
      {(totalCusto !== undefined || duracaoMs) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {totalCusto !== undefined && (
            <span>💰 R$ {(totalCusto * 5.5).toFixed(2)} de custo</span>
          )}
          {duracaoMs && <span>⏱️ {(duracaoMs / 1000).toFixed(1)}s</span>}
        </div>
      )}
    </motion.div>
  );
}
