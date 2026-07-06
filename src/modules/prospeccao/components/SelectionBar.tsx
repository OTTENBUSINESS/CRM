import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

interface Props {
  count: number;
  custoEstimado: number;
  tempoEstimadoSegundos: number;
  onAnalisar: () => void;
  onDescartar: () => void;
  loading?: boolean;
}

export function SelectionBar({
  count,
  custoEstimado,
  tempoEstimadoSegundos,
  onAnalisar,
  onDescartar,
  loading,
}: Props) {
  const { state, isMobile } = useSidebar();
  const sidebarWidth = isMobile || state !== "expanded" ? 0 : 256;

  return (
    <AnimatePresence>
      {count > 0 && (
        <div
          style={{ left: `calc(50% + ${sidebarWidth / 2}px)` }}
          className="fixed bottom-6 z-40 w-[min(720px,calc(100vw-32px))] -translate-x-1/2"
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="rounded-2xl border border-border/70 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/40 p-3 flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
              {count}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {count} selecionado{count !== 1 ? "s" : ""}
              </p>
              <p className="text-[11px] text-muted-foreground">
                💰 R$ {(custoEstimado * 5.5).toFixed(2)} · ⏱️ ~{Math.ceil(tempoEstimadoSegundos)}s
              </p>
            </div>

            <Button variant="ghost" size="sm" onClick={onDescartar} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>

            <Button onClick={onAnalisar} disabled={loading} className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Analisar {count}
            </Button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
