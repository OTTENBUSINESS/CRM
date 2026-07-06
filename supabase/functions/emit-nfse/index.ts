// ============================================================
// emit-nfse
// Emite NFSe via Focus NFe (endpoint /v2/nfsen) a partir de um
// deal_payment. Faz polling até autorizar (18x5s), salva em
// nfse_emissions, registra na timeline (company_activities) e
// envia email com o PDF via Resend.
//
// Body (default = emitir): { deal_payment_id, lead_id? }
// Body (check_status):     { action: "check_status", emission_id }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getEmailConfig } from "../_shared/tenant-email-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function focusBaseUrl(ambiente: string | null): string {
  return ambiente === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function focusAuth(apiToken: string): string {
  // Basic Auth: token + ":" em base64
  return `Basic ${btoa(apiToken + ":")}`;
}

function onlyDigits(v: string | null | undefined): string {
  return (v || "").replace(/\D/g, "");
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function extractFocusError(data: any): string {
  if (!data) return "Erro desconhecido na Focus NFe";
  if (Array.isArray(data.erros) && data.erros.length > 0) {
    return data.erros
      .map((e: any) => (e.codigo ? `[${e.codigo}] ` : "") + (e.mensagem || JSON.stringify(e)))
      .join(" | ");
  }
  return data.mensagem || data.codigo || JSON.stringify(data);
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

interface CepInfo {
  ibge: string;
  bairro: string;
  uf: string;
  logradouro: string;
}

// Lookup do CEP: ViaCEP (retorna código IBGE direto).
// Fallback: BrasilAPI (cep v2) + lista de municípios pra achar o código IBGE.
async function lookupCep(cep: string): Promise<CepInfo | null> {
  // 1. ViaCEP
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (res.ok) {
      const data = await res.json();
      if (!data.erro && data.ibge) {
        return {
          ibge: String(data.ibge),
          bairro: data.bairro || "",
          uf: data.uf || "",
          logradouro: data.logradouro || "",
        };
      }
    }
  } catch (err) {
    console.warn("[emit-nfse] ViaCEP falhou:", err);
  }

  // 2. BrasilAPI (fallback)
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.state || !data.city) return null;

    // BrasilAPI não retorna código IBGE no CEP — busca na lista de municípios da UF
    let ibge = "";
    try {
      const munRes = await fetch(
        `https://brasilapi.com.br/api/ibge/municipios/v1/${data.state}`,
      );
      if (munRes.ok) {
        const municipios = await munRes.json();
        const alvo = normalize(data.city);
        const found = (municipios || []).find((m: any) => normalize(m.nome || "") === alvo);
        if (found?.codigo_ibge) ibge = String(found.codigo_ibge).slice(0, 7);
      }
    } catch (err) {
      console.warn("[emit-nfse] BrasilAPI municipios falhou:", err);
    }

    if (!ibge) return null;
    return {
      ibge,
      bairro: data.neighborhood || "",
      uf: data.state || "",
      logradouro: data.street || "",
    };
  } catch (err) {
    console.warn("[emit-nfse] BrasilAPI CEP falhou:", err);
    return null;
  }
}

// Registra o evento na timeline do lead (o hook useClientTimeline lê
// company_activities com task_type = 'nfse')
async function createTimelineActivity(
  supabase: any,
  emission: any,
  numero: string,
  valor: number,
  pdfUrl: string | null,
) {
  try {
    await supabase.from("company_activities").insert({
      tenant_id: emission.tenant_id,
      lead_id: emission.lead_id,
      task_type: "nfse",
      team: "sales",
      name: `🧾 NFSe ${numero} emitida`,
      description: `Nota fiscal de serviço nº ${numero} emitida no valor de R$ ${formatBRL(valor)}.`,
      status: "completed",
      completed: true,
      metadata: {
        nfse_number: numero,
        valor,
        emission_id: emission.id,
        deal_payment_id: emission.deal_payment_id,
        pdf_url: pdfUrl,
      },
    });
  } catch (err) {
    console.error("[emit-nfse] Erro ao criar activity na timeline (não fatal):", err);
  }
}

function buildEmailHtml(opts: {
  razaoSocial: string;
  numero: string;
  valor: number;
  pdfUrl: string | null;
  verificationCode: string | null;
}): string {
  const { razaoSocial, numero, valor, pdfUrl, verificationCode } = opts;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#111827;padding:24px 32px;">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${razaoSocial}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">Sua Nota Fiscal foi emitida 🧾</h1>
            <p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.6;">
              Segue a Nota Fiscal de Serviço Eletrônica (NFS-e) referente ao seu pagamento.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
              <tr><td style="padding:16px;">
                <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Número da nota: <strong style="color:#111827;">${numero}</strong></p>
                <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Valor do serviço: <strong style="color:#111827;">R$ ${formatBRL(valor)}</strong></p>
                ${verificationCode ? `<p style="margin:0;font-size:13px;color:#6b7280;">Código de verificação: <strong style="color:#111827;">${verificationCode}</strong></p>` : ""}
              </td></tr>
            </table>
            ${
              pdfUrl
                ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="background:#111827;border-radius:8px;">
                    <a href="${pdfUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Baixar Nota Fiscal (PDF)</a>
                  </td></tr></table>`
                : ""
            }
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Email automático — não é necessário responder.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Envia o email da nota via Resend. Se a config não estiver completa,
// PULA sem falhar a emissão.
async function sendNfseEmail(
  supabase: any,
  emission: any,
  lead: any,
  razaoSocial: string,
  numero: string,
  valor: number,
  pdfUrl: string | null,
  verificationCode: string | null,
) {
  try {
    const to = lead?.nfse_email || lead?.email;
    if (!to) {
      console.warn("[emit-nfse] Lead sem email — pulando envio da nota por email");
      return;
    }

    const cfg = await getEmailConfig(supabase);
    if (!cfg?.resend_api_key || !cfg?.from_email) {
      console.warn("[emit-nfse] Resend não configurado (RESEND_API_KEY/EMAIL_FROM) — pulando envio de email");
      return;
    }

    const fromName = (cfg.from_name || razaoSocial || "CRM").trim();
    const html = buildEmailHtml({ razaoSocial, numero, valor, pdfUrl, verificationCode });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.resend_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${cfg.from_email}>`,
        to: [to],
        subject: `Sua Nota Fiscal ${numero} — ${razaoSocial}`,
        html,
        reply_to: cfg.reply_to || undefined,
      }),
    });

    if (res.ok) {
      await supabase
        .from("nfse_emissions")
        .update({
          email_sent_to: to,
          email_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", emission.id);
      console.log(`[emit-nfse] Email da NFSe ${numero} enviado pra ${to}`);
    } else {
      const err = await res.text();
      console.warn("[emit-nfse] Falha ao enviar email da nota (não fatal):", err.slice(0, 300));
    }
  } catch (err) {
    console.warn("[emit-nfse] Erro no envio de email (não fatal):", err);
  }
}

// Finaliza uma emissão autorizada: atualiza o registro, cria a activity
// na timeline e envia o email.
async function finalizeAuthorized(supabase: any, emission: any, focusData: any, lead: any, fc: any) {
  const numero = String(focusData.numero || "");
  const pdfUrl = focusData.url_danfse || focusData.url || null;
  const xmlUrl = focusData.caminho_xml_nota_fiscal || null;
  const verificationCode = focusData.codigo_verificacao || null;
  const valor = Number(emission.valor_servico) || 0;

  await supabase
    .from("nfse_emissions")
    .update({
      focus_nfe_status: "autorizado",
      nfse_number: numero,
      verification_code: verificationCode,
      pdf_url: pdfUrl,
      xml_url: xmlUrl,
      focus_nfe_response: focusData,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", emission.id);

  await createTimelineActivity(supabase, emission, numero, valor, pdfUrl);
  await sendNfseEmail(
    supabase,
    emission,
    lead,
    fc?.razao_social || "Sua empresa",
    numero,
    valor,
    pdfUrl,
    verificationCode,
  );

  return { numero, pdfUrl, xmlUrl, verificationCode };
}

async function markError(supabase: any, emissionId: string, focusData: any) {
  await supabase
    .from("nfse_emissions")
    .update({
      focus_nfe_status: "erro",
      error_message: extractFocusError(focusData).slice(0, 1000),
      focus_nfe_response: focusData,
      updated_at: new Date().toISOString(),
    })
    .eq("id", emissionId);
}

// ============================================================
// Ação: check_status — verifica emissão pendente na Focus
// ============================================================
async function checkStatus(supabase: any, emissionId: string): Promise<Response> {
  if (!emissionId) return json({ error: "emission_id é obrigatório" }, 400);

  const { data: emission, error: emErr } = await supabase
    .from("nfse_emissions")
    .select("*")
    .eq("id", emissionId)
    .maybeSingle();
  if (emErr || !emission) return json({ error: "Emissão não encontrada" }, 404);

  const { data: fc } = await supabase
    .from("fiscal_config")
    .select("*")
    .eq("tenant_id", emission.tenant_id)
    .limit(1)
    .maybeSingle();
  if (!fc?.api_token) {
    return json({ error: "Configure os dados fiscais em Configurações" }, 400);
  }

  const base = focusBaseUrl(fc.ambiente);
  const res = await fetch(`${base}/v2/nfsen/${emission.reference_id}`, {
    headers: { Authorization: focusAuth(fc.api_token) },
  });
  const focusData = await res.json().catch(() => ({}));

  if (focusData.status === "autorizado") {
    if (emission.focus_nfe_status !== "autorizado") {
      const { data: lead } = await supabase
        .from("leads")
        .select("id, name, email, nfse_email")
        .eq("id", emission.lead_id)
        .maybeSingle();
      const result = await finalizeAuthorized(supabase, emission, focusData, lead, fc);
      return json({
        success: true,
        status: "autorizado",
        emission_id: emission.id,
        nfse_number: result.numero,
        pdf_url: result.pdfUrl,
      });
    }
    return json({
      success: true,
      status: "autorizado",
      emission_id: emission.id,
      nfse_number: emission.nfse_number,
      pdf_url: emission.pdf_url,
    });
  }

  if (focusData.status === "erro_autorizacao") {
    await markError(supabase, emission.id, focusData);
    return json({
      success: false,
      status: "erro",
      emission_id: emission.id,
      error: extractFocusError(focusData),
    });
  }

  return json({ success: true, status: "processando", emission_id: emission.id });
}

// ============================================================
// Ação default: emitir NFSe
// ============================================================
async function emitir(supabase: any, body: any): Promise<Response> {
  const dealPaymentId = body.deal_payment_id;
  if (!dealPaymentId) return json({ error: "deal_payment_id é obrigatório" }, 400);

  // 1. Pagamento + deal (pra chegar no produto)
  const { data: payment, error: payErr } = await supabase
    .from("deal_payments")
    .select("*, deal:deals(id, lead_id, product_id)")
    .eq("id", dealPaymentId)
    .maybeSingle();
  if (payErr || !payment) return json({ error: "Pagamento não encontrado" }, 404);

  const leadId = body.lead_id || payment.payer_lead_id || payment.deal?.lead_id;
  if (!leadId) return json({ error: "Não foi possível identificar o cliente (lead) do pagamento" }, 400);

  // 2. Config fiscal do tenant (prestador + token Focus)
  const { data: fc } = await supabase
    .from("fiscal_config")
    .select("*")
    .eq("tenant_id", payment.tenant_id)
    .limit(1)
    .maybeSingle();
  if (!fc || !fc.api_token || !fc.cnpj || !fc.codigo_municipio) {
    return json({ error: "Configure os dados fiscais em Configurações" }, 400);
  }

  // 3. Lead (tomador)
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, company_name, cpf_cnpj, nfse_email, email, address, cep, city_name, state")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return json({ error: "Cliente (lead) não encontrado" }, 404);

  const docDigits = onlyDigits(lead.cpf_cnpj);
  if (docDigits.length !== 11 && docDigits.length !== 14) {
    return json({ error: "CPF/CNPJ do cliente inválido ou não preenchido. Preencha os dados fiscais do cliente antes de emitir." }, 400);
  }

  const cep = onlyDigits(lead.cep);
  if (cep.length !== 8) {
    return json({ error: "CEP do cliente inválido ou não preenchido. Preencha os dados fiscais do cliente antes de emitir." }, 400);
  }

  // 4. Lookup do código IBGE do município do tomador
  const cepInfo = await lookupCep(cep);
  if (!cepInfo?.ibge) {
    return json({ error: "Não foi possível obter o código IBGE do município a partir do CEP do cliente. Verifique o CEP." }, 400);
  }

  // 5. Produto (dados fiscais do serviço)
  let product: any = null;
  const productId = payment.deal?.product_id;
  if (productId) {
    const { data: p } = await supabase
      .from("products")
      .select("id, name, nfse_codigo_tributacao_nacional, nfse_codigo_nbs, nfse_cnae, nfse_aliquota_iss, nfse_description, nfse_service_code, nfse_item_lista_servico")
      .eq("id", productId)
      .maybeSingle();
    product = p;
  }

  const valorServico = round2(Number(payment.amount) || 0);
  if (valorServico <= 0) return json({ error: "Valor do pagamento inválido para emissão" }, 400);

  const aliquota = round2(Number(product?.nfse_aliquota_iss ?? 5));
  const valorIss = round2(valorServico * (aliquota / 100));
  const opcaoSN = Number(fc.codigo_opcao_simples_nacional ?? 1);

  // 6. Auto-incrementa o numero_dps
  const numeroDps = (Number(fc.ultimo_numero_dps) || 200) + 1;
  await supabase
    .from("fiscal_config")
    .update({ ultimo_numero_dps: numeroDps, updated_at: new Date().toISOString() })
    .eq("id", fc.id);

  // 7. Reference ID externo
  const referenceId = `nfse-${dealPaymentId}-${Date.now()}`;

  // 8. Datas (timezone -0300)
  const nowSp = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dataEmissao = nowSp.toISOString().slice(0, 19) + "-0300";
  const dataCompetencia = dataEmissao.slice(0, 10);

  // 9. Payload Focus NFe
  const codigoMunicipioEmissora = parseInt(onlyDigits(fc.codigo_municipio), 10);
  const payload: Record<string, unknown> = {
    data_emissao: dataEmissao,
    data_competencia: dataCompetencia,
    codigo_municipio_emissora: codigoMunicipioEmissora,
    cnpj_prestador: onlyDigits(fc.cnpj),
    codigo_opcao_simples_nacional: opcaoSN,
    regime_especial_tributacao: Number(fc.regime_especial_tributacao ?? 0),
    serie_dps: fc.serie_rps || "900",
    numero_dps: String(numeroDps),

    razao_social_tomador: lead.company_name || lead.name,
    logradouro_tomador: lead.address || cepInfo.logradouro || "Não informado",
    numero_tomador: "S/N",
    bairro_tomador: cepInfo.bairro || "Centro",
    codigo_municipio_tomador: parseInt(cepInfo.ibge, 10),
    uf_tomador: String(lead.state || cepInfo.uf || "").toUpperCase(),
    cep_tomador: cep,

    codigo_municipio_prestacao: codigoMunicipioEmissora,
    codigo_tributacao_nacional_iss: product?.nfse_codigo_tributacao_nacional || "010601",
    descricao_servico:
      product?.nfse_description || product?.name || payment.description || "Prestação de serviços",
    valor_servico: valorServico,
    tributacao_iss: 1,
    tipo_retencao_iss: 1,
    codigo_nbs: product?.nfse_codigo_nbs || "115011000",
  };

  if (fc.inscricao_municipal) {
    payload.inscricao_municipal_prestador = onlyDigits(fc.inscricao_municipal);
  }

  // CPF vs CNPJ do tomador — NUNCA os dois
  if (docDigits.length === 11) {
    payload.cpf_tomador = docDigits;
  } else {
    payload.cnpj_tomador = docDigits;
  }

  const emailTomador = lead.nfse_email || lead.email;
  if (emailTomador) payload.email_tomador = emailTomador;

  // Simples Nacional: opção 2/3 não envia alíquota (município calcula);
  // não optante (1) envia alíquota + tributos com valor mínimo
  if (opcaoSN === 2 || opcaoSN === 3) {
    payload.regime_tributario_simples_nacional = 1;
  } else {
    payload.percentual_aliquota_relativa_municipio = aliquota;
    payload.valor_total_tributos_federais = 0.01;
    payload.valor_total_tributos_estaduais = 0.01;
    payload.valor_total_tributos_municipais = 0.01;
  }

  // 10. POST na Focus NFe
  const base = focusBaseUrl(fc.ambiente);
  const focusRes = await fetch(`${base}/v2/nfsen?ref=${referenceId}`, {
    method: "POST",
    headers: {
      Authorization: focusAuth(fc.api_token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const focusData = await focusRes.json().catch(() => ({}));

  // 11. Erro HTTP na emissão → salva registro com erro e retorna
  if (focusRes.status !== 202) {
    const { data: errEmission } = await supabase
      .from("nfse_emissions")
      .insert({
        tenant_id: payment.tenant_id,
        deal_payment_id: dealPaymentId,
        lead_id: leadId,
        deal_id: payment.deal_id || payment.deal?.id || null,
        product_id: product?.id || productId || null,
        reference_id: referenceId,
        focus_nfe_status: "erro",
        valor_servico: valorServico,
        aliquota_iss: aliquota,
        valor_iss: valorIss,
        error_message: extractFocusError(focusData).slice(0, 1000),
        focus_nfe_response: focusData,
      })
      .select("id")
      .single();

    return json({
      success: false,
      status: "erro",
      emission_id: errEmission?.id || null,
      error: extractFocusError(focusData),
    }, 400);
  }

  // 12. Registro "processando"
  const { data: emission, error: insErr } = await supabase
    .from("nfse_emissions")
    .insert({
      tenant_id: payment.tenant_id,
      deal_payment_id: dealPaymentId,
      lead_id: leadId,
      deal_id: payment.deal_id || payment.deal?.id || null,
      product_id: product?.id || productId || null,
      reference_id: referenceId,
      focus_nfe_status: "processando",
      valor_servico: valorServico,
      aliquota_iss: aliquota,
      valor_iss: valorIss,
      focus_nfe_response: focusData,
    })
    .select()
    .single();
  if (insErr || !emission) {
    console.error("[emit-nfse] Erro ao salvar emissão:", insErr);
    return json({ error: "Nota enviada pra Focus, mas falhou ao salvar o registro. Reference: " + referenceId }, 500);
  }

  // 13. Polling: 18 tentativas x 5s = 90s max
  for (let i = 0; i < 18; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    let statusData: any = null;
    try {
      const st = await fetch(`${base}/v2/nfsen/${referenceId}`, {
        headers: { Authorization: focusAuth(fc.api_token) },
      });
      statusData = await st.json().catch(() => null);
    } catch (err) {
      console.warn(`[emit-nfse] Poll ${i + 1}/18 falhou:`, err);
      continue;
    }
    if (!statusData) continue;

    if (statusData.status === "autorizado") {
      const result = await finalizeAuthorized(supabase, emission, statusData, lead, fc);
      return json({
        success: true,
        status: "autorizado",
        emission_id: emission.id,
        nfse_number: result.numero,
        pdf_url: result.pdfUrl,
        verification_code: result.verificationCode,
      });
    }

    if (statusData.status === "erro_autorizacao") {
      await markError(supabase, emission.id, statusData);
      return json({
        success: false,
        status: "erro",
        emission_id: emission.id,
        error: extractFocusError(statusData),
      });
    }
    // "processando_autorizacao" → continua o polling
  }

  // 14. Timeout do polling — frontend continua via action: check_status
  return json({
    success: true,
    status: "processando",
    emission_id: emission.id,
    reference_id: referenceId,
    message: "NFSe em processamento. Use action=check_status pra acompanhar.",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));

    if (body.action === "check_status") {
      return await checkStatus(supabase, body.emission_id);
    }
    return await emitir(supabase, body);
  } catch (err: any) {
    console.error("[emit-nfse] Erro:", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
});
