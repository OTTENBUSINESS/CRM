// asaas-create-charge
// Cria (ou reusa) o cliente no Asaas e gera uma cobrança a partir de um
// deal_payment. Retorna { payment_link, asaas_payment_id } pro frontend.
//
// Chamada pelo frontend (useGeneratePaymentLink) com:
//   { deal_payment_id, cpf_cnpj }
//
// Lê ASAAS_API_KEY de Configurações → Integrações. Detecta sandbox vs produção
// pela própria chave (chaves de sandbox contêm "hmlg").

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";
import { isAuthorizedCaller, unauthorizedResponse } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function asaasBase(key: string): string {
  return key.includes("hmlg") || key.includes("sandbox")
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3";
}

const digits = (s?: string | null) => (s || "").replace(/\D/g, "");

function billingTypeOf(raw?: string | null): string {
  const v = (raw || "").toLowerCase();
  if (v.includes("boleto")) return "BOLETO";
  if (v.includes("pix")) return "PIX";
  if (v.includes("credit") || v.includes("cart")) return "CREDIT_CARD";
  return "UNDEFINED"; // link de checkout (cliente escolhe o método)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!isAuthorizedCaller(req)) return unauthorizedResponse(corsHeaders);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { deal_payment_id, cpf_cnpj } = await req.json();
    if (!deal_payment_id) return json({ error: "deal_payment_id é obrigatório" }, 400);

    const apiKey = await getIntegrationKey(supabase, "ASAAS_API_KEY");
    if (!apiKey) return json({ error: "ASAAS_API_KEY não configurada. Preencha em Configurações → Integrações." }, 400);
    const base = asaasBase(apiKey);
    const headers = { "Content-Type": "application/json", "access_token": apiKey };

    // 1) Carrega o pagamento
    const { data: pay, error: payErr } = await supabase
      .from("deal_payments")
      .select("id, deal_id, payer_lead_id, description, billing_type, amount, installments, due_date, asaas_payment_id, payment_link, tenant_id")
      .eq("id", deal_payment_id)
      .single();
    if (payErr || !pay) return json({ error: "Pagamento não encontrado" }, 404);

    // Idempotência: se já tem cobrança, devolve o link existente (não duplica)
    if (pay.asaas_payment_id) {
      return json({ payment_link: pay.payment_link, asaas_payment_id: pay.asaas_payment_id, reused: true });
    }

    // 2) Carrega o cliente (lead pagador)
    const { data: lead } = await supabase
      .from("leads").select("id, name, email, phone, cpf_cnpj").eq("id", pay.payer_lead_id).single();
    if (!lead) return json({ error: "Cliente (lead) não encontrado" }, 404);

    const doc = digits(cpf_cnpj || lead.cpf_cnpj);
    if (doc.length !== 11 && doc.length !== 14) {
      return json({ error: "CPF/CNPJ inválido ou ausente. Informe o documento do cliente." }, 400);
    }

    // 3) Obtém ou cria o customer no Asaas
    let asaasCustomerId: string | null = null;
    const { data: cust } = await supabase
      .from("asaas_customers").select("asaas_customer_id").eq("lead_id", lead.id).maybeSingle();
    if (cust?.asaas_customer_id) {
      asaasCustomerId = cust.asaas_customer_id;
    } else {
      const r = await fetch(`${base}/customers`, {
        method: "POST", headers,
        body: JSON.stringify({
          name: lead.name || "Cliente",
          cpfCnpj: doc,
          email: lead.email || undefined,
          mobilePhone: digits(lead.phone) || undefined,
          externalReference: lead.id,
        }),
      });
      const cd = await r.json();
      if (!r.ok) return json({ error: "Erro ao criar cliente no Asaas", detail: cd }, 502);
      asaasCustomerId = cd.id;
      await supabase.from("asaas_customers").insert({
        lead_id: lead.id, asaas_customer_id: asaasCustomerId, name: lead.name,
        cpf_cnpj: doc, email: lead.email, phone: lead.phone, tenant_id: pay.tenant_id,
      });
    }

    // 4) Cria a cobrança
    const dueDate = pay.due_date || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const body: Record<string, unknown> = {
      customer: asaasCustomerId,
      billingType: billingTypeOf(pay.billing_type),
      dueDate,
      description: pay.description || "Pagamento",
      externalReference: pay.id,
    };
    if (pay.installments && pay.installments > 1) {
      body.installmentCount = pay.installments;
      body.totalValue = Number(pay.amount);
    } else {
      body.value = Number(pay.amount);
    }

    const cr = await fetch(`${base}/payments`, { method: "POST", headers, body: JSON.stringify(body) });
    const charge = await cr.json();
    if (!cr.ok) return json({ error: "Erro ao criar cobrança no Asaas", detail: charge }, 502);

    const link = charge.invoiceUrl || charge.bankSlipUrl || null;
    await supabase.from("deal_payments").update({
      asaas_payment_id: charge.id,
      asaas_invoice_number: charge.invoiceNumber ? String(charge.invoiceNumber) : null,
      payment_link: link,
      invoice_url: charge.invoiceUrl || null,
      gateway: "asaas",
      status: "pending",
      updated_at: new Date().toISOString(),
    }).eq("id", pay.id);

    return json({ payment_link: link, asaas_payment_id: charge.id });
  } catch (e) {
    console.error("[asaas-create-charge] erro:", e);
    return json({ error: String(e) }, 500);
  }
});
