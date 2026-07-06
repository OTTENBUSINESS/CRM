import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, MapPin, Pencil } from "lucide-react";
import type { Intent } from "../types";

interface Props {
  intent: Intent;
  detecting: boolean;
  onEdit: () => void;
}

export function IntentPreview({ intent, detecting, onEdit }: Props) {
  return (
    <AnimatePresence mode="wait">
      {detecting ? (
        <motion.div
          key="detecting"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Sparkles className="h-4 w-4 animate-pulse text-primary" />
          <span>Interpretando sua busca...</span>
        </motion.div>
      ) : (
        <motion.div
          key="result"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Detectei:</span>
          </div>

          <Pill icon={null} value={intent.tipo || intent.nicho} accent />

          {intent.cidade && (
            <Pill
              icon={<MapPin className="h-3 w-3" />}
              value={`${intent.cidade}${intent.uf ? ` / ${intent.uf}` : ""}`}
            />
          )}

          {typeof intent.confianca === "number" && (
            <span
              className={`text-[10px] font-medium ${
                intent.confianca >= 0.8
                  ? "text-emerald-500"
                  : intent.confianca >= 0.5
                  ? "text-amber-500"
                  : "text-orange-500"
              }`}
            >
              {Math.round(intent.confianca * 100)}% confiança
            </span>
          )}

          <button
            type="button"
            onClick={onEdit}
            className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />
            editar
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Pill({
  icon,
  value,
  accent = false,
}: {
  icon: React.ReactNode;
  value: string;
  accent?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        accent
          ? "bg-primary/10 text-primary border border-primary/20"
          : "bg-muted text-foreground border border-border"
      }`}
    >
      {icon}
      {value}
    </span>
  );
}
