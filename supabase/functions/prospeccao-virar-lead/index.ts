// ============================================================
// prospeccao-virar-lead
// Cria lead em `leads` + deal em `deals` a partir de um
// prospeccao_leads_descobertos + prospeccao_diagnosticos
// verify_jwt: false
// ============================================================

import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Input {
  lead_descoberto_ids: string[]; // suporta bulk
  pipeline_id: string;
  pipeline_stage_id: string;
  sales_rep_id?: string;
  sdr_id?: string;
  product_id?: string;
  tags?: string[];
  phone_override?: string; // permite preencher phone manualmente quando ld.telefone é vazio
  attach_diagnosis_link?: boolean;
  user_id?: string;
}

interface CreateResult {
  lead_descoberto_id: string;
  lead_id?: string;
  deal_id?: string;
  ok: boolean;
  erro?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: Input = await req.json();
    const {
      lead_descoberto_ids,
      pipeline_id,
      pipeline_stage_id,
      sales_rep_id,
      sdr_id,
      product_id,
      tags = [],
      phone_override,
      attach_diagnosis_link = true,
      user_id,
    } = body;

    if (!Array.isArray(lead_descoberto_ids) || lead_descoberto_ids.length === 0) {
      return json({ error: "lead_descoberto_ids é obrigatório" }, 400);
    }
    if (!pipeline_id || !pipeline_stage_id) {
      return json({ error: "pipeline_id e pipeline_stage_id são obrigatórios" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: CreateResult[] = [];

    for (const ldId of lead_descoberto_ids) {
      try {
        // 1. Carrega lead descoberto
        const { data: ld, error: errLd } = await supabase
          .from("prospeccao_leads_descobertos")
          .select("*")
          .eq("id", ldId)
          .single();

        if (errLd || !ld) {
          results.push({ lead_descoberto_id: ldId, ok: false, erro: "Lead descoberto não encontrado" });
          continue;
        }

        if (ld.lead_id) {
          // Já virou lead — retorna o existente
          results.push({
            lead_descoberto_id: ldId,
            lead_id: ld.lead_id,
            deal_id: ld.deal_id,
            ok: true,
            erro: "já era lead",
          });
          continue;
        }

        // 2. Diagnóstico mais recente desse lead
        const { data: diag } = await supabase
          .from("prospeccao_diagnosticos")
          .select("*")
          .eq("lead_descoberto_id", ldId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // 3. Phone obrigatório em leads — usa override do body OU ld.telefone
        const phoneRaw = (phone_override && phone_override.trim()) || ld.telefone || "";
        const phone = phoneRaw.replace(/\D/g, "");
        if (!phone || phone.length < 10) {
          results.push({
            lead_descoberto_id: ldId,
            ok: false,
            erro: "Telefone obrigatório (mín 10 dígitos com DDD). Edite no modal antes de virar lead.",
          });
          continue;
        }

        // Atualiza prospeccao_leads_descobertos com phone se veio do override
        if (phone_override && !ld.telefone) {
          await supabase
            .from("prospeccao_leads_descobertos")
            .update({ telefone: phone })
            .eq("id", ldId);
        }

        // 4. Cria lead
        const leadInsert: Record<string, any> = {
          tenant_id: ld.tenant_id, // herda o tenant do lead descoberto (multi-tenant)
          name: ld.nome,
          phone: phone,
          instagram: ld.instagram_handle || null,
          pipeline_stage_id: pipeline_stage_id,
          sales_rep_id: sales_rep_id || null,
          sales_stage: "Novo",
          tags: tags.length > 0 ? tags : null,
          metadata: {
            origem: "prospeccao_diagnostico",
            prospeccao_lead_descoberto_id: ld.id,
            prospeccao_busca_id: ld.busca_id,
            categoria: ld.categoria,
            endereco: ld.endereco,
            cidade: ld.cidade,
            uf: ld.uf,
            url_maps: ld.url_maps,
            url_site: ld.url_site,
            facebook_url: ld.facebook_url,
            linkedin_url: ld.linkedin_url,
            youtube_url: ld.youtube_url,
            tiktok_handle: ld.tiktok_handle,
            nota_google: ld.nota_google,
            qtd_avaliacoes_google: ld.qtd_avaliacoes,
            diagnostico_id: diag?.id,
            diagnostico_score_geral: diag?.score_geral,
            diagnostico_resumo: diag?.resumo_executivo,
          },
        };

        const { data: leadCreated, error: errLead } = await supabase
          .from("leads")
          .insert(leadInsert)
          .select("id")
          .single();

        if (errLead || !leadCreated) {
          results.push({
            lead_descoberto_id: ldId,
            ok: false,
            erro: `Erro ao criar lead: ${errLead?.message}`,
          });
          continue;
        }

        // 5. Cria deal
        const dealNotesParts: string[] = [];
        if (diag) {
          dealNotesParts.push(`📊 Diagnóstico Prospecção — Score Geral ${diag.score_geral}/10`);
          if (diag.resumo_executivo) dealNotesParts.push(diag.resumo_executivo);
          if (Array.isArray(diag.oportunidades) && diag.oportunidades.length > 0) {
            dealNotesParts.push("\n🎯 Oportunidades de IA:");
            diag.oportunidades.forEach((op: any, i: number) => {
              dealNotesParts.push(`${i + 1}. ${op.titulo} — ${op.impacto_estimado || ""}`);
            });
          }
        }

        const dealInsert: Record<string, any> = {
          tenant_id: ld.tenant_id, // herda o tenant do lead descoberto (multi-tenant)
          lead_id: leadCreated.id,
          pipeline_id: pipeline_id,
          pipeline_stage_id: pipeline_stage_id,
          sales_rep_id: sales_rep_id || null,
          sdr_id: sdr_id || null,
          product_id: product_id || null,
          title: `${ld.nome}${ld.cidade ? ` (${ld.cidade})` : ""}`,
          status: "negotiation",
          notes: dealNotesParts.join("\n"),
          metadata: {
            origem: "prospeccao_diagnostico",
            prospeccao_diagnostico_id: diag?.id,
            prospeccao_score_geral: diag?.score_geral,
          },
        };

        const { data: dealCreated, error: errDeal } = await supabase
          .from("deals")
          .insert(dealInsert)
          .select("id")
          .single();

        if (errDeal) {
          console.error("[virar-lead] Erro deal:", errDeal);
          // Lead foi criado mas deal falhou — ainda retorna sucesso parcial
        }

        // 6. Atualiza prospeccao_leads_descobertos
        await supabase
          .from("prospeccao_leads_descobertos")
          .update({
            status: "virou_lead",
            virou_lead_em: new Date().toISOString(),
            lead_id: leadCreated.id,
            deal_id: dealCreated?.id || null,
          })
          .eq("id", ldId);

        results.push({
          lead_descoberto_id: ldId,
          lead_id: leadCreated.id,
          deal_id: dealCreated?.id,
          ok: true,
        });
      } catch (e) {
        results.push({ lead_descoberto_id: ldId, ok: false, erro: String(e) });
      }
    }

    return json({ results });
  } catch (err) {
    console.error("[virar-lead] Erro fatal:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
