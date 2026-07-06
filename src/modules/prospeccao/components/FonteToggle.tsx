import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { CATALOGO_FONTES, FONTES_BY_ID } from "../lib/fontes";

interface Props {
  selecionadas: string[];
  obrigatorias?: string[];
  onChange: (fontes: string[]) => void;
  fontesDisponiveis?: string[]; // se passado, filtra o catálogo
}

export function FonteToggle({ selecionadas, obrigatorias = [], onChange, fontesDisponiveis }: Props) {
  const fontes = fontesDisponiveis
    ? CATALOGO_FONTES.filter((f) => fontesDisponiveis.includes(f.id))
    : CATALOGO_FONTES;

  const toggle = (id: string) => {
    if (obrigatorias.includes(id)) return; // não permite desligar obrigatória
    const next = selecionadas.includes(id)
      ? selecionadas.filter((x) => x !== id)
      : [...selecionadas, id];
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {fontes.map((f) => {
        const ativa = selecionadas.includes(f.id);
        const obrig = obrigatorias.includes(f.id);
        return (
          <motion.button
            key={f.id}
            whileTap={{ scale: 0.96 }}
            onClick={() => toggle(f.id)}
            disabled={obrig}
            type="button"
            className={`group relative inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
              ativa
                ? obrig
                  ? "border-primary/40 bg-primary/15 text-primary cursor-default"
                  : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            }`}
            title={f.descricao}
          >
            <span className="text-sm leading-none">{f.emoji}</span>
            <span>{f.label}</span>
            {ativa && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/20"
              >
                <Check className="h-2.5 w-2.5" />
              </motion.span>
            )}
            {obrig && (
              <span className="ml-0.5 text-[9px] uppercase tracking-wider text-primary/60">
                core
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
