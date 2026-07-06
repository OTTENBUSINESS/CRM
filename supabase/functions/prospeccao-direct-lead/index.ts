// ============================================================
// prospeccao-direct-lead
// Cria 1 lead descoberto direto (sem passar pela busca de Maps)
// quando usuário cola @ Instagram ou URL de site
//
// Body: { type: "instagram" | "site", value: "@handle" ou "https://..." }
// Retorna: { busca_id, lead_descoberto_id, lead }
// verify_jwt: false
// ============================================================

import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";
import { enriquecerLead } from "./enriquecer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Input {
  type: "instagram" | "site";
  value: string;
  fontes?: string[];
  user_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, value, fontes, user_id }: Input = await req.json();
    if (!type || !value) return json({ error: "type e value obrigatórios" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let nome = "";
    let instagram_handle: string | null = null;
    let url_site: string | null = null;
    let queryDisplay = "";

    if (type === "instagram") {
      // Limpar handle (remove @ e URL prefixes)
      const handle = value
        .replace(/^@/, "")
        .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "")
        .replace(/\/$/, "")
        .trim();
      if (!handle || handle.length > 60) {
        return json({ error: "Handle Instagram inválido" }, 400);
      }
      instagram_handle = handle;
      nome = `@${handle}`;
      queryDisplay = `Análise direta @${handle}`;
    } else if (type === "site") {
      // Normaliza URL
      let url = value.trim();
      if (!url.startsWith("http")) url = `https://${url}`;
      try {
        const parsed = new URL(url);
        url_site = parsed.toString().replace(/\/$/, "");
        nome = parsed.hostname.replace(/^www\./, "");
        queryDisplay = `Análise direta ${nome}`;
      } catch {
        return json({ error: "URL inválida" }, 400);
      }
    } else {
      return json({ error: "type deve ser instagram ou site" }, 400);
    }

    // 1. Cria a busca (single-result) — usa fontes que o vendedor selecionou
    const fontesFinal =
      Array.isArray(fontes) && fontes.length > 0
        ? fontes
        : ["site", "google_maps", "instagram"]; // fallback mínimo

    const { data: busca, error: errBusca } = await supabase
      .from("prospeccao_buscas")
      .insert({
        query: queryDisplay,
        query_normalizada: queryDisplay.toLowerCase(),
        nicho: null,
        cidade: null,
        uf: null,
        fontes_selecionadas: fontesFinal,
        limite_solicitado: 1,
        total_resultados: 1,
        status: "completed",
        custo: 0,
        intent_detectada: { tipo: "direct", source: type },
        created_by_user_id: user_id || null,
      })
      .select()
      .single();

    if (errBusca || !busca) {
      return json({ error: "Falha ao criar busca", detalhes: errBusca?.message }, 500);
    }

    // 2. Cross-discovery exaustiva ANTES de salvar (Google + IG bio + site scrape em loop)
    const FIRECRAWL_API_KEY = await getIntegrationKey(supabase, "FIRECRAWL_API_KEY");
    let descoberta = {
      url_site,
      instagram_handle,
      facebook_url: null as string | null,
      linkedin_url: null as string | null,
      youtube_url: null as string | null,
      tiktok_handle: null as string | null,
      telefone: null as string | null,
      custo: 0,
      duracao_ms: 0,
      fontes_consultadas: [] as string[],
    };

    if (FIRECRAWL_API_KEY) {
      try {
        const SCRAPECREATORS_API_KEY = await getIntegrationKey(supabase, "SCRAPECREATORS_API_KEY");
        const enr = await enriquecerLead(
          { nome, instagram_handle, url_site, raw_data: {} },
          FIRECRAWL_API_KEY,
          SCRAPECREATORS_API_KEY
        );
        descoberta = {
          url_site: enr.url_site || url_site,
          instagram_handle: enr.instagram_handle || instagram_handle,
          facebook_url: enr.facebook_url,
          linkedin_url: enr.linkedin_url,
          youtube_url: enr.youtube_url,
          tiktok_handle: enr.tiktok_handle,
          telefone: enr.telefone,
          custo: enr.custo,
          duracao_ms: enr.duracao_ms,
          fontes_consultadas: enr.fontes_consultadas,
        };
      } catch (e) {
        console.error("[direct-lead] enriquecer falhou:", e);
      }
    }

    // 3. Cria o lead descoberto JÁ enriquecido
    const { data: lead, error: errLead } = await supabase
      .from("prospeccao_leads_descobertos")
      .insert({
        busca_id: busca.id,
        nome,
        instagram_handle: descoberta.instagram_handle,
        url_site: descoberta.url_site,
        facebook_url: descoberta.facebook_url,
        linkedin_url: descoberta.linkedin_url,
        youtube_url: descoberta.youtube_url,
        tiktok_handle: descoberta.tiktok_handle,
        telefone: descoberta.telefone,
        status: "descoberto",
        raw_data: {
          fonte: "direct_input",
          tipo: type,
          valor_original: value,
          enriquecimento: {
            custo: descoberta.custo,
            fontes: descoberta.fontes_consultadas,
            duracao_ms: descoberta.duracao_ms,
          },
        },
        created_by_user_id: user_id || null,
      })
      .select()
      .single();

    if (errLead || !lead) {
      return json({ error: "Falha ao criar lead descoberto", detalhes: errLead?.message }, 500);
    }

    return json({
      busca_id: busca.id,
      lead_descoberto_id: lead.id,
      lead,
    });
  } catch (err) {
    console.error("[direct-lead] Erro:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
