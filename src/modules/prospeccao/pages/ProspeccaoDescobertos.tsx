import { useMemo, useState, startTransition } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Filter,
  CheckSquare,
  Square,
  Search as SearchIcon,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useAnalisar,
  useBusca,
  useDescartarLeads,
  useDiagnosticosDaBusca,
  useLeadsDescobertos,
} from "../hooks/useProspeccao";
import { calcularCustoFontes } from "../lib/fontes";
import { LeadDescobertoCard } from "../components/LeadDescobertoCard";
import { SelectionBar } from "../components/SelectionBar";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { AnaliseLoadingOverlay } from "../components/AnaliseLoadingOverlay";
import { toast } from "sonner";

type SortMode = "pior_reviews" | "melhor_reviews" | "mais_reviews" | "alfabetica";

export default function ProspeccaoDescobertos() {
  const { buscaId } = useParams<{ buscaId: string }>();
  const navigate = useNavigate();
  const { data: busca, isLoading: loadingBusca } = useBusca(buscaId);
  const { data: leads = [], isLoading: loadingLeads } = useLeadsDescobertos(buscaId);
  const { data: diagnosticos = [] } = useDiagnosticosDaBusca(buscaId);
  const { mutateAsync: descartar } = useDescartarLeads();

  // Map de leadId → diagnóstico mais recente
  const diagPorLead = useMemo(() => {
    const map = new Map<string, (typeof diagnosticos)[number]>();
    for (const d of diagnosticos) {
      if (!map.has(d.lead_descoberto_id)) map.set(d.lead_descoberto_id, d);
    }
    return map;
  }, [diagnosticos]);
  const { mutateAsync: analisar, isPending: analisando } = useAnalisar();
  const [analiseAtual, setAnaliseAtual] = useState<{
    leadNome: string;
    fontesConcluidas: string[];
    fontesFalhadas: string[];
  } | null>(null);

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroComSite, setFiltroComSite] = useState(false);
  const [filtroNotaMin, setFiltroNotaMin] = useState<number | null>(null);
  const [sort, setSort] = useState<SortMode>("pior_reviews");

  const fontesSelecionadas = busca?.fontes_selecionadas || ["google_maps", "site", "instagram"];
  const custoUnitarioAnalise = calcularCustoFontes(fontesSelecionadas);

  const toggle = (id: string) =>
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtrados = useMemo(() => {
    let arr = leads.filter((l) => l.status !== "descartado");
    if (filtroTexto.trim()) {
      const q = filtroTexto.toLowerCase();
      arr = arr.filter(
        (l) =>
          l.nome.toLowerCase().includes(q) ||
          (l.endereco || "").toLowerCase().includes(q) ||
          (l.categoria || "").toLowerCase().includes(q)
      );
    }
    if (filtroComSite) arr = arr.filter((l) => !!l.url_site);
    if (filtroNotaMin !== null) arr = arr.filter((l) => (l.nota_google ?? 0) >= filtroNotaMin);

    arr = [...arr].sort((a, b) => {
      switch (sort) {
        case "pior_reviews":
          return (a.nota_google ?? 99) - (b.nota_google ?? 99);
        case "melhor_reviews":
          return (b.nota_google ?? 0) - (a.nota_google ?? 0);
        case "mais_reviews":
          return (b.qtd_avaliacoes ?? 0) - (a.qtd_avaliacoes ?? 0);
        case "alfabetica":
          return a.nome.localeCompare(b.nome);
      }
    });

    return arr;
  }, [leads, filtroTexto, filtroComSite, filtroNotaMin, sort]);

  const todosVisiveisSelecionados =
    filtrados.length > 0 && filtrados.every((l) => selecionados.has(l.id));

  const toggleAll = () => {
    if (todosVisiveisSelecionados) {
      const next = new Set(selecionados);
      filtrados.forEach((l) => next.delete(l.id));
      setSelecionados(next);
    } else {
      const next = new Set(selecionados);
      filtrados.forEach((l) => next.add(l.id));
      setSelecionados(next);
    }
  };

  const handleDescartar = async () => {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;
    if (!confirm(`Descartar ${ids.length} leads?`)) return;
    await descartar(ids);
    setSelecionados(new Set());
  };

  const handleAnalisar = async () => {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;

    if (ids.length > 1) {
      toast.info(
        `Análise em massa em breve. Por agora, vou analisar só o primeiro selecionado.`
      );
    }

    const leadId = ids[0];
    const leadObj = leads.find((l) => l.id === leadId);
    setAnaliseAtual({
      leadNome: leadObj?.nome || "Lead",
      fontesConcluidas: [],
      fontesFalhadas: [],
    });

    try {
      const res = await analisar({
        lead_descoberto_id: leadId,
        fontes: fontesSelecionadas,
      });
      // Atualiza estado final do overlay (rápido animation flush antes de navegar)
      setAnaliseAtual((prev) =>
        prev
          ? {
              ...prev,
              fontesConcluidas: res.fontes_consultadas,
              fontesFalhadas: res.fontes_falhadas,
            }
          : null
      );
      // Pequeno delay pro check verde aparecer antes de navegar
      setTimeout(() => {
        startTransition(() => {
          navigate(`/comercial/prospeccao/diagnostico/${res.diagnostico_id}`);
        });
      }, 700);
    } catch (err) {
      setAnaliseAtual(null);
      // toast já vem do hook
    }
  };

  if (loadingBusca || loadingLeads) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="h-8 w-48 rounded bg-muted animate-pulse mb-6" />
          <LoadingSkeleton count={6} />
        </div>
      </AppLayout>
    );
  }

  if (busca?.status === "failed") {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-4 text-lg font-semibold">Busca falhou</h2>
          <p className="mt-1 text-sm text-muted-foreground">{busca.erro}</p>
          <Button onClick={() => startTransition(() => navigate("/comercial/prospeccao"))} className="mt-4">
            Tentar nova busca
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-6 py-8 pb-32">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => startTransition(() => navigate("/comercial/prospeccao"))}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Nova busca
          </button>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {leads.length} {leads.length === 1 ? "lead encontrado" : "leads encontrados"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">"{busca?.query}"</span>
                {busca?.cidade && (
                  <>
                    {" "}
                    em {busca.cidade}
                    {busca.uf && `/${busca.uf}`}
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <SortPicker value={sort} onChange={setSort} />
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              placeholder="Filtrar por nome, bairro, categoria..."
              className="pl-9 h-9"
            />
          </div>

          <FilterChip
            ativo={filtroComSite}
            onClick={() => setFiltroComSite((v) => !v)}
            label="Com site"
          />
          <FilterChip
            ativo={filtroNotaMin === 4.5}
            onClick={() => setFiltroNotaMin((v) => (v === 4.5 ? null : 4.5))}
            label="⭐ 4.5+"
          />
          <FilterChip
            ativo={filtroNotaMin === 3.5}
            onClick={() => setFiltroNotaMin((v) => (v === 3.5 ? null : 3.5))}
            label="⭐ 3.5+"
          />

          <button
            onClick={toggleAll}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {todosVisiveisSelecionados ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            Selecionar todos ({filtrados.length})
          </button>
        </div>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <EmptyState
            title="Nenhum lead bate com os filtros"
            description="Ajuste os filtros ou refaça a busca com outra query."
          />
        ) : (
          <motion.div layout className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence>
              {filtrados.map((lead) => {
                const diag = diagPorLead.get(lead.id);
                return (
                  <LeadDescobertoCard
                    key={lead.id}
                    lead={lead}
                    selecionado={selecionados.has(lead.id)}
                    onToggle={() => toggle(lead.id)}
                    diagnosticoId={diag?.id}
                    scoreGeral={diag?.score_geral}
                    onAbrirDiagnostico={() => {
                      if (diag?.id) {
                        startTransition(() => {
                          navigate(`/comercial/prospeccao/diagnostico/${diag.id}`);
                        });
                      }
                    }}
                  />
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Bottom action bar */}
      <SelectionBar
        count={selecionados.size}
        custoEstimado={custoUnitarioAnalise * selecionados.size}
        tempoEstimadoSegundos={Math.max(8, selecionados.size * 8)}
        onAnalisar={handleAnalisar}
        onDescartar={handleDescartar}
        loading={analisando}
      />

      {/* Overlay de análise em andamento */}
      <AnaliseLoadingOverlay
        open={!!analiseAtual}
        fontes={fontesSelecionadas}
        fontesConcluidas={analiseAtual?.fontesConcluidas || []}
        fontesFalhadas={analiseAtual?.fontesFalhadas || []}
        leadNome={analiseAtual?.leadNome}
      />
    </AppLayout>
  );
}

function FilterChip({
  ativo,
  onClick,
  label,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
        ativo
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      <Filter className="h-3 w-3" />
      {label}
    </button>
  );
}

function SortPicker({ value, onChange }: { value: SortMode; onChange: (m: SortMode) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortMode)}
      className="h-9 rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
      title="Ordenar"
    >
      <option value="pior_reviews">🔥 Pior reviews (mais dor)</option>
      <option value="melhor_reviews">⭐ Melhor reviews</option>
      <option value="mais_reviews">📊 Mais reviews</option>
      <option value="alfabetica">🔤 A → Z</option>
    </select>
  );
}
