// ============================================================
// prospeccao-analisar
// Recebe { lead_descoberto_id, fontes? }
// Roda fontes em paralelo (Promise.allSettled)
// Compila scores + chama Gemini pra oportunidades
// Salva em prospeccao_diagnosticos
// verify_jwt: false
// ============================================================

import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";
import { integrationKeys } from "./keys.ts";
import { analisarSite } from "./fontes/site.ts";
import { analisarMaps } from "./fontes/maps.ts";
import { analisarInstagram } from "./fontes/instagram.ts";
import { analisarDoctoralia } from "./fontes/doctoralia.ts";
import { analisarReclameAqui } from "./fontes/reclame_aqui.ts";
import { analisarFacebook } from "./fontes/facebook.ts";
import { analisarLinkedinCompany } from "./fontes/linkedin_company.ts";
import { analisarLinkedinFounder } from "./fontes/linkedin_founder.ts";
import { analisarYoutube } from "./fontes/youtube.ts";
import { analisarIfood } from "./fontes/ifood.ts";
import { analisarTiktok } from "./fontes/tiktok.ts";
import { analisarTripadvisor } from "./fontes/tripadvisor.ts";
import { analisarMercadoLivre } from "./fontes/mercado_livre.ts";
import { analisarGoogleReviews } from "./fontes/google_reviews.ts";
import { analisarGlassdoor } from "./fontes/glassdoor.ts";
import { analisarMetaAds } from "./fontes/meta_ads.ts";
import { analisarGoogleAds } from "./fontes/google_ads.ts";
import { analisarPosicaoGoogle } from "./fontes/posicao_google.ts";
import { analisarPageSpeed } from "./fontes/pagespeed.ts";
import { analisarContextoNegocio } from "./fontes/contexto_negocio.ts";
import { compilarDiagnostico } from "./compiler.ts";
import { enriquecerLead } from "./enriquecer.ts";
import { extractPhoneFromAchados } from "./fontes/extract_phone.ts";
import type { FonteResult } from "./fontes/site.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Fontes implementadas (resto fica como "pendente" pro usuário)
const FONTES_IMPLEMENTADAS = [
  "site",
  "google_maps",
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
  "google_reviews",
  "glassdoor",
  "meta_ads",
  "google_ads",
  "fb_ad_library", // alias de meta_ads
  "google_ad_library", // alias de google_ads
  "posicao_google",
  "pagespeed",
  "contexto_negocio",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();

  try {
    const { lead_descoberto_id, fontes: fontesPedidas, user_id } = await req.json();

    if (!lead_descoberto_id) return json({ error: "lead_descoberto_id é obrigatório" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve chaves de integração UMA vez por request e expõe pras fontes via keys.ts
    const FIRECRAWL_API_KEY = await getIntegrationKey(supabase, "FIRECRAWL_API_KEY");
    const GEMINI_API_KEY = await getIntegrationKey(supabase, "GEMINI_API_KEY");
    integrationKeys.GEMINI_API_KEY = GEMINI_API_KEY;
    integrationKeys.SCRAPECREATORS_API_KEY = await getIntegrationKey(supabase, "SCRAPECREATORS_API_KEY");
    integrationKeys.GOOGLE_PAGESPEED_KEY = await getIntegrationKey(supabase, "GOOGLE_PAGESPEED_KEY");

    if (!FIRECRAWL_API_KEY) return json({ error: "FIRECRAWL_API_KEY não configurada" }, 500);
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY não configurada" }, 500);

    // 1. Carrega lead descoberto
    const { data: lead, error: errLead } = await supabase
      .from("prospeccao_leads_descobertos")
      .select("*")
      .eq("id", lead_descoberto_id)
      .single();

    if (errLead || !lead) {
      return json({ error: "Lead descoberto não encontrado", detalhes: errLead?.message }, 404);
    }

    // 2. Carrega busca + template do nicho
    const { data: busca } = await supabase
      .from("prospeccao_buscas")
      .select("*")
      .eq("id", lead.busca_id)
      .single();

    const fontes: string[] = (fontesPedidas && Array.isArray(fontesPedidas) && fontesPedidas.length > 0)
      ? fontesPedidas
      : (busca?.fontes_selecionadas || ["google_maps", "site", "instagram"]);

    let template: any = null;
    if (busca?.nicho) {
      const { data: tpl } = await supabase
        .from("prospeccao_templates_nicho")
        .select("*")
        .eq("nicho", busca.nicho)
        .single();
      template = tpl;
    }

    const pesos = template?.pesos_score || {
      site: 25,
      google_maps: 30,
      instagram: 25,
      facebook: 10,
      reclame_aqui: 10,
    };

    const promptOportunidades =
      template?.prompt_oportunidades ||
      "Você é consultor que vende soluções de IA. Analise os achados e identifique 3 oportunidades concretas. Tom direto, fala da DOR específica.";

    // 3. Cria registro de diagnóstico (status running)
    const { data: diagnostico, error: errDiag } = await supabase
      .from("prospeccao_diagnosticos")
      .insert({
        lead_descoberto_id: lead.id,
        busca_id: lead.busca_id,
        status: "running",
        fontes_consultadas: [],
        created_by_user_id: user_id || null,
      })
      .select()
      .single();

    if (errDiag || !diagnostico) {
      return json({ error: "Falha ao criar diagnóstico", detalhes: errDiag?.message }, 500);
    }

    // Marca lead como "analisando"
    await supabase
      .from("prospeccao_leads_descobertos")
      .update({ status: "analisando" })
      .eq("id", lead.id);

    // 3.5. Enriquecimento — busca URLs públicas (site, IG, FB, YT, LinkedIn) via Google Search
    // Resolve o caso onde o parser do Maps não capturou as URLs.
    const enriquecimento = await enriquecerLead(lead, FIRECRAWL_API_KEY!, integrationKeys.SCRAPECREATORS_API_KEY);

    // Loga uso do enriquecimento
    if (enriquecimento.custo > 0 || enriquecimento.erro) {
      await supabase.from("prospeccao_uso_api").insert({
        api_provider: "firecrawl",
        endpoint: "/v1/search",
        fonte: "enriquecimento",
        custo: enriquecimento.custo,
        sucesso: !enriquecimento.erro,
        duracao_ms: enriquecimento.duracao_ms,
        busca_id: lead.busca_id,
        lead_descoberto_id: lead.id,
        erro: enriquecimento.erro,
        created_by_user_id: user_id || null,
      });
    }

    // Atualiza o lead descoberto com URLs encontradas (preserva o que já tinha)
    const enriquecimentoUpdate: Record<string, any> = {};
    if (!lead.url_site && enriquecimento.url_site) enriquecimentoUpdate.url_site = enriquecimento.url_site;
    if (!lead.instagram_handle && enriquecimento.instagram_handle)
      enriquecimentoUpdate.instagram_handle = enriquecimento.instagram_handle;
    if (!lead.facebook_url && enriquecimento.facebook_url)
      enriquecimentoUpdate.facebook_url = enriquecimento.facebook_url;
    if (!lead.linkedin_url && enriquecimento.linkedin_url)
      enriquecimentoUpdate.linkedin_url = enriquecimento.linkedin_url;
    if (!lead.youtube_url && enriquecimento.youtube_url)
      enriquecimentoUpdate.youtube_url = enriquecimento.youtube_url;
    if (!lead.tiktok_handle && enriquecimento.tiktok_handle)
      enriquecimentoUpdate.tiktok_handle = enriquecimento.tiktok_handle;

    if (Object.keys(enriquecimentoUpdate).length > 0) {
      await supabase
        .from("prospeccao_leads_descobertos")
        .update(enriquecimentoUpdate)
        .eq("id", lead.id);
      // Mescla no objeto local pra as fontes usarem
      Object.assign(lead, enriquecimentoUpdate);
    }

    // 4. Roda fontes em paralelo (Promise.allSettled — falha de uma não derruba as outras)
    const taskMap: { fonte: string; promise: Promise<FonteResult> }[] = [];

    if (fontes.includes("site")) {
      taskMap.push({ fonte: "site", promise: analisarSite(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("google_maps")) {
      taskMap.push({ fonte: "google_maps", promise: analisarMaps(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("instagram")) {
      taskMap.push({ fonte: "instagram", promise: analisarInstagram(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("doctoralia")) {
      taskMap.push({ fonte: "doctoralia", promise: analisarDoctoralia(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("reclame_aqui")) {
      taskMap.push({ fonte: "reclame_aqui", promise: analisarReclameAqui(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("facebook")) {
      taskMap.push({ fonte: "facebook", promise: analisarFacebook(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("linkedin_company")) {
      taskMap.push({
        fonte: "linkedin_company",
        promise: analisarLinkedinCompany(lead, FIRECRAWL_API_KEY!),
      });
    }
    if (fontes.includes("linkedin_founder")) {
      taskMap.push({
        fonte: "linkedin_founder",
        promise: analisarLinkedinFounder(lead, FIRECRAWL_API_KEY!),
      });
    }
    if (fontes.includes("youtube")) {
      taskMap.push({ fonte: "youtube", promise: analisarYoutube(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("ifood")) {
      taskMap.push({ fonte: "ifood", promise: analisarIfood(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("tiktok")) {
      taskMap.push({ fonte: "tiktok", promise: analisarTiktok(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("tripadvisor")) {
      taskMap.push({ fonte: "tripadvisor", promise: analisarTripadvisor(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("mercado_livre")) {
      taskMap.push({ fonte: "mercado_livre", promise: analisarMercadoLivre(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("google_reviews")) {
      taskMap.push({ fonte: "google_reviews", promise: analisarGoogleReviews(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("glassdoor")) {
      taskMap.push({ fonte: "glassdoor", promise: analisarGlassdoor(lead, FIRECRAWL_API_KEY!) });
    }
    // Meta Ads e FB Ad Library = mesma coisa (alias). Roda só uma vez.
    if (fontes.includes("meta_ads") || fontes.includes("fb_ad_library")) {
      taskMap.push({ fonte: "meta_ads", promise: analisarMetaAds(lead, FIRECRAWL_API_KEY!) });
    }
    // Google Ads e Google Ad Library = mesma coisa (alias).
    if (fontes.includes("google_ads") || fontes.includes("google_ad_library")) {
      taskMap.push({ fonte: "google_ads", promise: analisarGoogleAds(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("posicao_google")) {
      taskMap.push({ fonte: "posicao_google", promise: analisarPosicaoGoogle(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("pagespeed")) {
      taskMap.push({ fonte: "pagespeed", promise: analisarPageSpeed(lead, FIRECRAWL_API_KEY!) });
    }
    if (fontes.includes("contexto_negocio")) {
      taskMap.push({
        fonte: "contexto_negocio",
        promise: analisarContextoNegocio(lead, FIRECRAWL_API_KEY!),
      });
    }

    // Demais fontes pedidas mas não implementadas → vão pra pendentes no compiler
    const naoImplementadas = fontes.filter((f) => !FONTES_IMPLEMENTADAS.includes(f));

    const settled = await Promise.allSettled(taskMap.map((t) => t.promise));
    const resultados: FonteResult[] = settled.map((s, idx) => {
      if (s.status === "fulfilled") return s.value;
      return {
        fonte: taskMap[idx].fonte,
        ok: false,
        score: null,
        achados: { problemas: [], atencao: [], positivos: [] },
        custo: 0,
        duracao_ms: 0,
        erro: String(s.reason),
      };
    });

    // 5. Loga uso de cada fonte
    const usoInserts = resultados.map((r) => ({
      api_provider: "firecrawl",
      endpoint: "/v1/scrape",
      fonte: r.fonte,
      custo: r.custo,
      sucesso: r.ok,
      duracao_ms: r.duracao_ms,
      busca_id: lead.busca_id,
      lead_descoberto_id: lead.id,
      erro: r.erro || null,
      created_by_user_id: user_id || null,
    }));
    if (usoInserts.length > 0) {
      await supabase.from("prospeccao_uso_api").insert(usoInserts);
    }

    // 6. Compila + Gemini pra oportunidades
    const compiled = await compilarDiagnostico(
      resultados,
      [...fontes, ...naoImplementadas],
      pesos,
      promptOportunidades,
      lead,
      GEMINI_API_KEY!
    );

    // 7. Atualiza diagnóstico no banco
    const tempoTotal = Date.now() - t0;

    const updatePayload: Record<string, any> = {
      status: "completed",
      score_geral: compiled.score_geral,
      score_atracao: compiled.score_atracao,
      score_qualificacao: compiled.score_qualificacao,
      score_conversao: compiled.score_conversao,
      score_retencao: compiled.score_retencao,
      oportunidades: compiled.oportunidades,
      resumo_executivo: compiled.resumo_executivo,
      custo_total: compiled.custo_total,
      tempo_analise_ms: tempoTotal,
      fontes_consultadas: compiled.fontes_consultadas,
      fontes_falhadas: compiled.fontes_falhadas,
      fontes_pendentes: compiled.fontes_pendentes,
    };

    // Mapeia scores e achados pras colunas certas
    const scoreColMap: Record<string, string> = {
      site: "score_site",
      google_maps: "score_google_maps",
      instagram: "score_instagram",
      facebook: "score_facebook",
      linkedin_company: "score_linkedin",
      youtube: "score_youtube",
      tiktok: "score_tiktok",
      doctoralia: "score_doctoralia",
      reclame_aqui: "score_reclame_aqui",
      ifood: "score_ifood",
      meta_ads: "score_meta_ads",
      google_ads: "score_google_ads",
      posicao_google: "score_posicao_google",
      pagespeed: "score_pagespeed",
    };
    const achadosColMap: Record<string, string> = {
      site: "achados_site",
      google_maps: "achados_maps",
      instagram: "achados_instagram",
      facebook: "achados_facebook",
      linkedin_company: "achados_linkedin",
      youtube: "achados_youtube",
      tiktok: "achados_tiktok",
      doctoralia: "achados_doctoralia",
      reclame_aqui: "achados_reclame_aqui",
      ifood: "achados_ifood",
      meta_ads: "achados_meta_ads",
      google_ads: "achados_google_ads",
      posicao_google: "achados_posicao_google",
      pagespeed: "achados_pagespeed",
      contexto_negocio: "achados_contexto_negocio",
    };

    for (const [fonte, score] of Object.entries(compiled.scores)) {
      const col = scoreColMap[fonte];
      if (col && score !== undefined) updatePayload[col] = score;
    }

    for (const [fonte, achados] of Object.entries(compiled.achados)) {
      const col = achadosColMap[fonte];
      if (col && achados) updatePayload[col] = achados;
    }

    await supabase.from("prospeccao_diagnosticos").update(updatePayload).eq("id", diagnostico.id);

    // 8. Extrai telefone das fontes raspadas (se ainda não tem) e marca como analisado
    const leadUpdate: Record<string, any> = { status: "analisado" };
    if (!lead.telefone) {
      const { phone, fonte } = extractPhoneFromAchados(compiled.achados);
      if (phone) {
        leadUpdate.telefone = phone;
        console.log(`[analisar] Telefone extraído de ${fonte}: ${phone}`);
      }
    }
    await supabase
      .from("prospeccao_leads_descobertos")
      .update(leadUpdate)
      .eq("id", lead.id);

    return json({
      diagnostico_id: diagnostico.id,
      lead_descoberto_id: lead.id,
      score_geral: compiled.score_geral,
      scores: compiled.scores,
      oportunidades: compiled.oportunidades,
      resumo: compiled.resumo_executivo,
      fontes_consultadas: compiled.fontes_consultadas,
      fontes_falhadas: compiled.fontes_falhadas,
      fontes_pendentes: compiled.fontes_pendentes,
      custo_total: compiled.custo_total,
      tempo_analise_ms: tempoTotal,
    });
  } catch (err) {
    console.error("[analisar] Erro fatal:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
