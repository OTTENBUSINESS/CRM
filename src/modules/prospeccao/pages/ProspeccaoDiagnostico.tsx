import { startTransition, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  AlertCircle,
  FileDown,
  Send,
  Star,
  Phone,
  Globe,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import { useDiagnostico, useLeadDescoberto } from "../hooks/useProspeccao";
import { ScoreGeralCard } from "../components/ScoreGeralCard";
import { CanalScoreRow } from "../components/CanalScoreRow";
import { OportunidadeCard } from "../components/OportunidadeCard";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { VirarLeadModal } from "../components/VirarLeadModal";
import { EnviarDiagnosticoModal } from "../components/EnviarDiagnosticoModal";
import type { AchadosCanal } from "../types";

const FONTES_ORDEM = [
  // Contexto (entendimento do negócio — vem primeiro)
  "contexto_negocio",
  // Atração
  "meta_ads",
  "google_ads",
  "posicao_google",
  "google_maps",
  "google_reviews",
  "instagram",
  "tiktok",
  "youtube",
  // Qualificação
  "site",
  "pagespeed",
  "facebook",
  "linkedin",
  "linkedin_company",
  "doctoralia",
  // Conversão
  "ifood",
  "tripadvisor",
  "mercado_livre",
  // Retenção
  "reclame_aqui",
  "glassdoor",
  // Espionagem
  "fb_ad_library",
  "google_ad_library",
];

export default function ProspeccaoDiagnostico() {
  const { diagnosticoId } = useParams<{ diagnosticoId: string }>();
  const navigate = useNavigate();
  const { data: diag, isLoading: loadingDiag } = useDiagnostico(diagnosticoId);
  const { data: lead } = useLeadDescoberto(diag?.lead_descoberto_id);
  const [virarLeadOpen, setVirarLeadOpen] = useState(false);
  const [enviarOpen, setEnviarOpen] = useState(false);

  if (loadingDiag) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="h-8 w-48 rounded bg-muted animate-pulse mb-6" />
          <LoadingSkeleton count={4} />
        </div>
      </AppLayout>
    );
  }

  if (!diag) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-4 text-lg font-semibold">Diagnóstico não encontrado</h2>
          <Button
            onClick={() => startTransition(() => navigate("/comercial/prospeccao"))}
            className="mt-4"
          >
            Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (diag.status === "failed") {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-4 text-lg font-semibold">Análise falhou</h2>
          <p className="mt-1 text-sm text-muted-foreground">{diag.erro}</p>
        </div>
      </AppLayout>
    );
  }

  // Mapeia score → achados
  const canais: { fonte: string; score: number | null; achados: AchadosCanal | null; status: "ok" | "falhou" | "pendente" }[] = [];

  const d = diag as any;
  const scoreMap: Record<string, number | null> = {
    site: diag.score_site,
    google_maps: diag.score_google_maps,
    instagram: diag.score_instagram,
    facebook: diag.score_facebook,
    linkedin_company: diag.score_linkedin,
    youtube: diag.score_youtube,
    tiktok: diag.score_tiktok,
    doctoralia: diag.score_doctoralia,
    reclame_aqui: diag.score_reclame_aqui,
    ifood: diag.score_ifood,
    meta_ads: d.score_meta_ads ?? null,
    google_ads: d.score_google_ads ?? null,
    posicao_google: d.score_posicao_google ?? null,
    pagespeed: d.score_pagespeed ?? null,
    contexto_negocio: d.achados_contexto_negocio ? 7 : null,
  };

  const achadosMap: Record<string, AchadosCanal | null> = {
    site: diag.achados_site,
    google_maps: diag.achados_maps,
    instagram: diag.achados_instagram,
    facebook: diag.achados_facebook,
    linkedin_company: diag.achados_linkedin,
    youtube: diag.achados_youtube,
    tiktok: diag.achados_tiktok,
    doctoralia: diag.achados_doctoralia,
    reclame_aqui: diag.achados_reclame_aqui,
    ifood: diag.achados_ifood,
    meta_ads: d.achados_meta_ads ?? null,
    google_ads: d.achados_google_ads ?? null,
    posicao_google: d.achados_posicao_google ?? null,
    pagespeed: d.achados_pagespeed ?? null,
    contexto_negocio: d.achados_contexto_negocio ?? null,
  };

  for (const fonte of FONTES_ORDEM) {
    const isPendente = diag.fontes_pendentes?.includes(fonte);
    const isFalhada = diag.fontes_falhadas?.includes(fonte);
    const isConsultada = diag.fontes_consultadas?.includes(fonte);

    if (!isPendente && !isFalhada && !isConsultada) continue;

    canais.push({
      fonte,
      score: scoreMap[fonte] ?? null,
      achados: achadosMap[fonte] ?? null,
      status: isPendente ? "pendente" : isFalhada ? "falhou" : "ok",
    });
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Header */}
        <div>
          <button
            onClick={() =>
              startTransition(() =>
                navigate(diag.busca_id ? `/comercial/prospeccao/busca/${diag.busca_id}` : "/comercial/prospeccao")
              )
            }
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar pra lista
          </button>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {lead?.nome || "Lead"}
            </h1>
            {lead?.categoria && (
              <p className="text-sm text-muted-foreground mt-1">{lead.categoria}</p>
            )}

            {/* Linha de info */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {lead?.endereco && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {lead.endereco}
                  {lead.cidade && `, ${lead.cidade}`}
                  {lead.uf && `/${lead.uf}`}
                </span>
              )}
              {lead?.telefone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {lead.telefone}
                </span>
              )}
              {lead?.url_site && (
                <a
                  href={lead.url_site}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Globe className="h-3 w-3" />
                  {cleanDomain(lead.url_site)}
                </a>
              )}
              {lead?.nota_google !== null && lead?.nota_google !== undefined && (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {lead.nota_google.toFixed(1)} ({lead.qtd_avaliacoes ?? 0})
                </span>
              )}
            </div>
          </motion.div>
        </div>

        {/* Score Geral Card */}
        {diag.score_geral !== null && (
          <ScoreGeralCard
            scoreGeral={diag.score_geral}
            resumo={diag.resumo_executivo}
            totalCusto={diag.custo_total}
            duracaoMs={diag.tempo_analise_ms}
          />
        )}

        {/* Canais */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            📊 Detalhamento por canal
          </h2>
          <div className="space-y-2">
            {canais.map((c) => (
              <CanalScoreRow
                key={c.fonte}
                fonte={c.fonte}
                score={c.score}
                achados={c.achados}
                status={c.status}
              />
            ))}
          </div>
        </div>

        {/* Oportunidades */}
        {diag.oportunidades && diag.oportunidades.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Onde a IA resolve
              </h2>
            </div>
            <div className="space-y-3">
              {diag.oportunidades.map((op, i) => (
                <OportunidadeCard key={i} oportunidade={op} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="sticky bottom-0 -mx-6 px-6 py-4 border-t border-border bg-background/80 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                window.open(
                  `/comercial/prospeccao/diagnostico/${diagnosticoId}/print`,
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
            >
              <FileDown className="h-4 w-4" />
              Gerar PDF
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={!lead || (!lead.telefone && !lead.instagram_handle)}
              onClick={() => setEnviarOpen(true)}
            >
              <Send className="h-4 w-4" />
              Enviar diagnóstico
            </Button>
            <Button
              className="gap-2 ml-auto"
              disabled={!lead || lead.status === "virou_lead"}
              onClick={() => setVirarLeadOpen(true)}
            >
              <Star className="h-4 w-4" />
              {lead?.status === "virou_lead" ? "Já é lead no CRM" : "Virar lead no CRM"}
            </Button>
          </div>
        </div>

        {/* Modal Virar lead */}
        {lead && (
          <VirarLeadModal
            open={virarLeadOpen}
            onClose={() => setVirarLeadOpen(false)}
            leadDescobertoIds={[lead.id]}
            leadDescobertoNome={lead.nome}
            leadDescobertoTelefone={lead.telefone}
          />
        )}

        {/* Modal Enviar diagnóstico */}
        {lead && diagnosticoId && (
          <EnviarDiagnosticoModal
            open={enviarOpen}
            onClose={() => setEnviarOpen(false)}
            diagnosticoId={diagnosticoId}
            leadNome={lead.nome}
            leadTelefone={lead.telefone}
            leadInstagram={lead.instagram_handle}
            leadEmail={(lead.raw_data as any)?.email || null}
          />
        )}
      </div>
    </AppLayout>
  );
}

function cleanDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
