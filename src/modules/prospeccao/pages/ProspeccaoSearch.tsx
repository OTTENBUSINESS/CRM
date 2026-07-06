import { startTransition, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Radar, Clock, History, Settings, FileText } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { BuscaForm } from "../components/BuscaForm";
import { useBuscar, useBuscasRecentes, useDiagnosticosPorBusca, useDirectLead } from "../hooks/useProspeccao";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ProspeccaoSearch() {
  const navigate = useNavigate();
  const { mutateAsync: buscar, isPending } = useBuscar();
  const { mutateAsync: direct, isPending: directPending } = useDirectLead();
  const { data: recentes } = useBuscasRecentes();

  const recentesIds = useMemo(() => (recentes || []).slice(0, 5).map((b) => b.id), [recentes]);
  const { data: diagPorBusca = {} } = useDiagnosticosPorBusca(recentesIds);

  const handleSubmit = async (params: Parameters<typeof buscar>[0]) => {
    try {
      const res = await buscar(params);
      startTransition(() => {
        navigate(`/comercial/prospeccao/busca/${res.busca_id}`);
      });
    } catch {
      // toast já tratado no hook
    }
  };

  const handleDirect = async (params: { type: "instagram" | "site"; value: string; fontes: string[] }) => {
    try {
      const res = await direct({ type: params.type, value: params.value, fontes: params.fontes });
      // Navega direto pra Tela 3 com 1 lead → vendedor seleciona e analisa
      startTransition(() => {
        navigate(`/comercial/prospeccao/busca/${res.busca_id}`);
      });
    } catch {
      // toast tratado no hook
    }
  };

  const goToBusca = (id: string) => {
    startTransition(() => {
      navigate(`/comercial/prospeccao/busca/${id}`);
    });
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-6 py-12 lg:py-16">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-4">
            <Radar className="h-3.5 w-3.5" />
            Prospecção
          </div>
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-foreground">
            Diga o que você quer prospectar
          </h1>
          <p className="mt-2 text-muted-foreground">
            A IA descobre os leads, raspa as fontes certas e te entrega o diagnóstico.
          </p>
        </motion.div>

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-border bg-card/40 backdrop-blur p-6 lg:p-8"
        >
          <BuscaForm
            onSubmit={handleSubmit}
            onDirect={handleDirect}
            onAbrirAnaliseExistente={(diagnosticoId) => {
              startTransition(() => {
                navigate(`/comercial/prospeccao/diagnostico/${diagnosticoId}`);
              });
            }}
            loading={isPending || directPending}
          />
        </motion.div>

        {/* Buscas recentes */}
        {recentes && recentes.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-10"
          >
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <History className="h-4 w-4" />
              <span>Buscas recentes</span>
            </div>

            <div className="space-y-1.5">
              {recentes.slice(0, 5).map((b) => {
                const diag = diagPorBusca[b.id];
                const temAnalise = !!diag && diag.total > 0;
                const isUnico = b.total_resultados === 1 && diag?.total === 1 && diag.primeiro_diagnostico_id;
                return (
                  <button
                    key={b.id}
                    onClick={() => {
                      // Se busca tem 1 lead único analisado, abre direto o diagnóstico
                      if (isUnico && diag?.primeiro_diagnostico_id) {
                        startTransition(() => {
                          navigate(`/comercial/prospeccao/diagnostico/${diag.primeiro_diagnostico_id}`);
                        });
                      } else {
                        goToBusca(b.id);
                      }
                    }}
                    className={`group flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-colors ${
                      temAnalise
                        ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10"
                        : "border-border/40 bg-card/30 hover:border-border hover:bg-card/60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{b.query}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {b.total_resultados} leads ·{" "}
                        {formatDistanceToNow(new Date(b.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {temAnalise && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                          <FileText className="h-3 w-3" />
                          {diag.total} analisad{diag.total > 1 ? "os" : "o"}
                          {diag.melhor_score !== null && (
                            <span className="font-bold">· {Number(diag.melhor_score).toFixed(1)}/10</span>
                          )}
                        </span>
                      )}
                      <Clock className="h-4 w-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Footer: link pra config das IAs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 pt-6 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground"
        >
          <span>Powered by IA na Prática</span>
          <button
            onClick={() => startTransition(() => navigate("/comercial/prospeccao/configuracoes"))}
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Configurar prompts das IAs
          </button>
        </motion.div>
      </div>
    </AppLayout>
  );
}
