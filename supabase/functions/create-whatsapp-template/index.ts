import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * create-whatsapp-template — Cria template Meta WhatsApp via Cloud API.
 * Single-tenant: pega primeira instância meta_cloud ativa, lê WABA + token do banco.
 * Após criar na Meta, faz UPSERT local com status retornado (PENDING normalmente).
 *
 * POST {
 *   name: string,                    // slug: lowercase, _, sem espaço
 *   category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
 *   language: string,                // ex: 'pt_BR'
 *   components: Array<{
 *     type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS',
 *     format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION', // só pra HEADER
 *     text?: string,                 // HEADER, BODY, FOOTER
 *     example?: {
 *       header_text?: string[],      // ex: ["10/10"]
 *       body_text?: string[][],      // ex: [["João", "Empresa"]]
 *       header_handle?: string[],    // pra HEADER de mídia (upload prévio)
 *     },
 *     buttons?: Array<{
 *       type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER',
 *       text: string,
 *       url?: string,                // pra URL
 *       phone_number?: string,       // pra PHONE_NUMBER
 *     }>,
 *   }>,
 * }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH_API_VERSION = "v22.0";

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function countVariables(text: string): number {
  const matches = text.match(/\{\{\s*(\d+)\s*\}\}/g) || [];
  return new Set(matches).size;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { name, category, language, components } = body;

    // Validações
    if (!name || !/^[a-z0-9_]+$/.test(name)) {
      return jsonRes({ error: "Nome inválido. Use lowercase, números e underscore (ex: boas_vindas_v2)" }, 400);
    }
    if (name.length > 512) return jsonRes({ error: "Nome muito longo (max 512)" }, 400);
    if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) {
      return jsonRes({ error: "Categoria inválida" }, 400);
    }
    if (!language) return jsonRes({ error: "Idioma obrigatório" }, 400);
    if (!Array.isArray(components) || components.length === 0) {
      return jsonRes({ error: "components obrigatório" }, 400);
    }

    // Precisa ter BODY
    const bodyComp = components.find((c: any) => c.type === 'BODY');
    if (!bodyComp || !bodyComp.text) {
      return jsonRes({ error: "Body é obrigatório com pelo menos algum texto" }, 400);
    }
    if (bodyComp.text.length > 1024) return jsonRes({ error: "Body muito longo (max 1024 chars)" }, 400);

    // Valida variáveis no body têm exemplo
    const bodyVarCount = countVariables(bodyComp.text);
    if (bodyVarCount > 0) {
      const examples = bodyComp.example?.body_text?.[0] || [];
      if (examples.length !== bodyVarCount) {
        return jsonRes({
          error: `Body tem ${bodyVarCount} variável(is) mas faltam exemplos. Forneça exemplo para cada {{N}}.`,
        }, 400);
      }
    }

    // Resolve instância Cloud API ativa
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("id, business_account_id, api_key, status, tenant_id")
      .eq("provider", "meta_cloud")
      .in("status", ["connected", "active"])
      .limit(1)
      .maybeSingle();

    if (!instance?.business_account_id || !instance?.api_key) {
      return jsonRes({ error: "Nenhuma instância Cloud API conectada" }, 404);
    }

    // POST pra Meta
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${instance.business_account_id}/message_templates`;
    const metaRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instance.api_key}`,
      },
      body: JSON.stringify({ name, category, language, components }),
    });

    const metaData = await metaRes.json();

    if (!metaRes.ok || metaData.error) {
      console.error("[create-whatsapp-template] Meta error:", metaData);
      return jsonRes({
        error: metaData.error?.message || "Falha ao criar template na Meta",
        meta_error: metaData.error,
      }, metaRes.status || 502);
    }

    // Meta retorna: { id, status }
    // status normalmente é PENDING; pode ser APPROVED se for tipo simples sem revisão necessária
    const metaTemplateId = metaData.id;
    const metaStatus = metaData.status || 'PENDING';
    const metaCategory = metaData.category || category;

    // Upsert local
    const { data: localTpl, error: insertErr } = await supabase
      .from("whatsapp_cloud_templates")
      .upsert(
        {
          tenant_id: instance.tenant_id,
          meta_template_id: metaTemplateId,
          meta_waba_id: instance.business_account_id,
          name,
          language,
          category: metaCategory,
          status: metaStatus,
          components,
          variables_count: bodyVarCount,
        },
        { onConflict: "tenant_id,name,language" }
      )
      .select()
      .single();

    if (insertErr) {
      console.error("[create-whatsapp-template] Insert error:", insertErr);
      // Não falha — template foi criado na Meta. Próxima sync vai pegar.
      return jsonRes({
        success: true,
        warning: "Template criado na Meta mas erro ao salvar local. Será sincronizado.",
        meta_template_id: metaTemplateId,
        status: metaStatus,
      });
    }

    return jsonRes({
      success: true,
      template: localTpl,
      status: metaStatus,
      message: metaStatus === 'PENDING'
        ? 'Template enviado pra Meta. Aprovação leva de minutos a 24h.'
        : `Template criado com status ${metaStatus}.`,
    });
  } catch (err: any) {
    console.error("[create-whatsapp-template]", err);
    return jsonRes({ error: err.message }, 500);
  }
});
