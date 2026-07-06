import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { fonteLabel, fonteEmoji } from "../lib/fontes";

interface Props {
  open: boolean;
  fontes: string[];
  fontesConcluidas?: string[];
  fontesFalhadas?: string[];
  leadNome?: string;
}

const FONTES_IMPLEMENTADAS = [
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

export function AnaliseLoadingOverlay({
  open,
  fontes,
  fontesConcluidas = [],
  fontesFalhadas = [],
  leadNome,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-xl"
        >
          <div className="w-[min(560px,calc(100vw-32px))] space-y-6">
            {/* Header */}
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center space-y-2"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3 w-3 animate-pulse" />
                Analisando
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {leadNome || "Lead em análise"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Raspando {fontes.length} canais em paralelo. Em ~15s teu diagnóstico tá pronto.
              </p>
            </motion.div>

            {/* Fontes */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, staggerChildren: 0.05 }}
              className="rounded-2xl border border-border bg-card/40 backdrop-blur p-4 space-y-2"
            >
              {fontes.map((id, idx) => {
                const concluida = fontesConcluidas.includes(id);
                const falhou = fontesFalhadas.includes(id);
                const naoImpl = !FONTES_IMPLEMENTADAS.includes(id);

                return (
                  <motion.div
                    key={id}
                    initial={{ x: -8, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.06 }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2"
                  >
                    <span className="text-base leading-none">{fonteEmoji(id)}</span>
                    <span className="flex-1 text-sm text-foreground">{fonteLabel(id)}</span>
                    <div className="flex items-center gap-2">
                      {naoImpl ? (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                          em breve
                        </span>
                      ) : falhou ? (
                        <AlertCircle className="h-4 w-4 text-rose-500" />
                      ) : concluida ? (
                        <motion.div
                          initial={{ scale: 0, rotate: -90 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        </motion.div>
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Tip */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-center text-[11px] text-muted-foreground/70"
            >
              💡 fontes que falham não interrompem a análise — outras seguem rodando
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
