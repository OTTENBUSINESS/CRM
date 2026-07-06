// ============================================================
// prospeccao-buscar
// Recebe { query, nicho, cidade, uf, fontes, limite }
// Chama Firecrawl /scrape no Google Maps
// Parser markdown extrai negócios
// Salva em prospeccao_buscas + prospeccao_leads_descobertos
// Loga uso em prospeccao_uso_api
// verify_jwt: false
// ============================================================

import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";
import { parseGoogleMapsMarkdown } from "./parser.ts";
import { enriquecerLead } from "./enriquecer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FIRECRAWL_BASE = "https://api.firecrawl.dev";
const CUSTO_FIRECRAWL_SCRAPE = 0.015;

interface BuscarInput {
  query: string;
  nicho?: string;
  cidade?: string;
  uf?: string;
  fontes?: string[];
  limite?: number;
  user_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();

  try {
    const body: BuscarInput = await req.json();
    const { query, nicho, cidade, uf, fontes = [], limite = 20, user_id } = body;

    if (!query || typeof query !== "string") return json({ error: "query é obrigatório" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const FIRECRAWL_API_KEY = await getIntegrationKey(supabase, "FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) return json({ error: "FIRECRAWL_API_KEY não configurada" }, 500);

    // 1. Cria registro de busca (status pending)
    const { data: busca, error: errBusca } = await supabase
      .from("prospeccao_buscas")
      .insert({
        query,
        query_normalizada: query.toLowerCase().trim(),
        nicho,
        cidade,
        uf,
        fontes_selecionadas: fontes,
        limite_solicitado: limite,
        status: "pending",
        created_by_user_id: user_id || null,
      })
      .select()
      .single();

    if (errBusca || !busca) {
      console.error("[buscar] Erro insert busca:", errBusca);
      return json({ error: "Falha ao criar busca", detalhes: errBusca?.message }, 500);
    }

    // 2. Monta URL Google Maps
    const queryMaps = cidade && uf ? `${query} ${cidade} ${uf}` : query;
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(queryMaps)}`;

    // 3. Chama Firecrawl
    const fcStart = Date.now();
    let firecrawlOk = false;
    let markdown = "";
    let fcErrorMsg: string | null = null;

    try {
      const fcRes = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: mapsUrl,
          formats: ["markdown"],
          waitFor: 4000,
          onlyMainContent: false,
        }),
      });

      if (!fcRes.ok) {
        fcErrorMsg = `Firecrawl HTTP ${fcRes.status}: ${await fcRes.text()}`;
      } else {
        const fcData = await fcRes.json();
        markdown = fcData?.data?.markdown || "";
        firecrawlOk = markdown.length > 100;
        if (!firecrawlOk) fcErrorMsg = "Markdown vazio do Firecrawl";
      }
    } catch (e) {
      fcErrorMsg = String(e);
    }

    const fcDuration = Date.now() - fcStart;

    // Loga uso (mesmo se falhou)
    await supabase.from("prospeccao_uso_api").insert({
      api_provider: "firecrawl",
      endpoint: "/v1/scrape",
      fonte: "google_maps",
      custo: firecrawlOk ? CUSTO_FIRECRAWL_SCRAPE : 0,
      sucesso: firecrawlOk,
      duracao_ms: fcDuration,
      busca_id: busca.id,
      erro: fcErrorMsg,
      created_by_user_id: user_id || null,
    });

    if (!firecrawlOk) {
      await supabase
        .from("prospeccao_buscas")
        .update({
          status: "failed",
          erro: fcErrorMsg,
          duracao_ms: Date.now() - t0,
        })
        .eq("id", busca.id);
      return json({ error: "Firecrawl falhou", detalhes: fcErrorMsg }, 502);
    }

    // 4. Parser
    const leadsRaw = parseGoogleMapsMarkdown(markdown);
    const leadsLimitados = leadsRaw.slice(0, limite);

    // 5. Insere leads descobertos
    const leadsInsert = leadsLimitados.map((lead) => ({
      busca_id: busca.id,
      nome: lead.nome,
      categoria: lead.categoria || null,
      telefone: lead.telefone || null,
      endereco: lead.endereco || null,
      cidade: lead.cidade || cidade || null,
      uf: lead.uf || uf || null,
      url_maps: lead.url_maps || null,
      url_site: lead.url_site || null,
      nota_google: lead.nota_google || null,
      qtd_avaliacoes: lead.qtd_avaliacoes || null,
      faixa_preco: lead.faixa_preco || null,
      raw_data: { fonte: "google_maps_via_firecrawl", original: lead },
      created_by_user_id: user_id || null,
    }));

    let leadsCriados: any[] = [];
    if (leadsInsert.length > 0) {
      const { data: inserted, error: errLeads } = await supabase
        .from("prospeccao_leads_descobertos")
        .insert(leadsInsert)
        .select();

      if (errLeads) {
        console.error("[buscar] Erro insert leads:", errLeads);
      } else {
        leadsCriados = inserted || [];
      }
    }

    // 5.5. Enriquecimento em paralelo — busca site/IG/FB/YT/LinkedIn de cada lead via Google Search
    // Roda só pra leads que não tem url_site ainda (parser do Maps não capturou)
    const leadsParaEnriquecer = leadsCriados.filter((l) => !l.url_site);
    let custoEnriquecimento = 0;

    if (leadsParaEnriquecer.length > 0) {
      const SCRAPECREATORS_API_KEY = await getIntegrationKey(supabase, "SCRAPECREATORS_API_KEY");
      const enriquecimentos = await Promise.allSettled(
        leadsParaEnriquecer.map((l) => enriquecerLead(l, FIRECRAWL_API_KEY!, SCRAPECREATORS_API_KEY))
      );

      const usoEnriquecimentoLogs: any[] = [];

      for (let i = 0; i < leadsParaEnriquecer.length; i++) {
        const lead = leadsParaEnriquecer[i];
        const r = enriquecimentos[i];
        const e = r.status === "fulfilled" ? r.value : null;

        usoEnriquecimentoLogs.push({
          api_provider: "firecrawl",
          endpoint: "/v1/search",
          fonte: "enriquecimento_busca",
          custo: e?.custo || 0,
          sucesso: e ? !e.erro : false,
          duracao_ms: e?.duracao_ms || 0,
          busca_id: busca.id,
          lead_descoberto_id: lead.id,
          erro: r.status === "rejected" ? String(r.reason) : e?.erro || null,
          created_by_user_id: user_id || null,
        });

        if (e && !e.erro) {
          custoEnriquecimento += e.custo;
          const update: Record<string, any> = {};
          if (e.url_site) update.url_site = e.url_site;
          if (e.instagram_handle) update.instagram_handle = e.instagram_handle;
          if (e.facebook_url) update.facebook_url = e.facebook_url;
          if (e.linkedin_url) update.linkedin_url = e.linkedin_url;
          if (e.youtube_url) update.youtube_url = e.youtube_url;
          if (e.tiktok_handle) update.tiktok_handle = e.tiktok_handle;

          if (Object.keys(update).length > 0) {
            await supabase
              .from("prospeccao_leads_descobertos")
              .update(update)
              .eq("id", lead.id);
            // Mescla no objeto que vai ser retornado
            Object.assign(lead, update);
          }
        }
      }

      if (usoEnriquecimentoLogs.length > 0) {
        await supabase.from("prospeccao_uso_api").insert(usoEnriquecimentoLogs);
      }
    }

    // 6. Atualiza busca com resultado final
    const duracaoTotal = Date.now() - t0;
    const custoFinal = CUSTO_FIRECRAWL_SCRAPE + custoEnriquecimento;

    await supabase
      .from("prospeccao_buscas")
      .update({
        status: "completed",
        total_resultados: leadsCriados.length,
        custo: custoFinal,
        duracao_ms: duracaoTotal,
        resultados_raw: { count: leadsLimitados.length, sample: leadsLimitados.slice(0, 3) },
      })
      .eq("id", busca.id);

    return json({
      busca_id: busca.id,
      total: leadsCriados.length,
      leads: leadsCriados,
      custo: custoFinal,
      duracao_ms: duracaoTotal,
    });
  } catch (err) {
    console.error("[buscar] Erro fatal:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
