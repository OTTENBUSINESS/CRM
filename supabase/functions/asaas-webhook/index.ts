// asaas-webhook
// Recebe as notificações do Asaas (pagamento confirmado, vencido, estornado...)
// e atualiza o status do deal_payment correspondente. Registra tudo em
// asaas_webhooks pra auditoria.
//
// verify_jwt = false (quem chama é o Asaas, sem JWT do Supabase).
// Segurança: valida o header 'asaas-access-token' contra ASAAS_WEBHOOK_TOKEN
// (configure o MESMO token no painel do Asaas ao cadastrar o webhook).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";

// Mapeia o evento do Asaas pro status interno do pagamento.
function statusFor(event: string): { status: string | null; paid: boolean } {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
    case "PAYMENT_RECEIVED_IN_CASH":
      return { status: "paid", paid: true };
    case "PAYMENT_OVERDUE":
      return { status: "overdue", paid: false };
    case "PAYMENT_REFUNDED":
    case "PAYMENT_PARTIALLY_REFUNDED":
      return { status: "refunded", paid: false };
    case "PAYMENT_DELETED":
    case "PAYMENT_CANCELED":
      return { status: "cancelled", paid: false };
    default:
      return { status: null, paid: false };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const ok = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

  try {
    // Validação de origem (se o token estiver configurado)
    const expected = await getIntegrationKey(supabase, "ASAAS_WEBHOOK_TOKEN");
    if (expected) {
      const got = req.headers.get("asaas-access-token");
      if (got !== expected) {
        console.warn("[asaas-webhook] token inválido");
        return ok({ error: "unauthorized" }, 401);
      }
    }

    const body = await req.json();
    const event: string = body.event || "";
    const payment = body.payment || {};
    const asaasPaymentId: string | null = payment.id || null;
    const dealPaymentId: string | null = payment.externalReference || null;

    // Descobre o tenant pelo pagamento (pra registrar o log no tenant certo)
    let tenantId = DEFAULT_TENANT;
    if (dealPaymentId || asaasPaymentId) {
      const { data: dp } = await supabase
        .from("deal_payments")
        .select("id, tenant_id")
        .or(`id.eq.${dealPaymentId || "00000000-0000-0000-0000-000000000000"},asaas_payment_id.eq.${asaasPaymentId || "x"}`)
        .maybeSingle();
      if (dp?.tenant_id) tenantId = dp.tenant_id;
    }

    // Log do evento
    const { data: logRow } = await supabase.from("asaas_webhooks").insert({
      event_type: event,
      asaas_payment_id: asaasPaymentId,
      payload: body,
      processed: false,
      tenant_id: tenantId,
    }).select("id").single();

    // Atualiza o pagamento
    const map = statusFor(event);
    let applied = false;
    if (map.status) {
      const upd: Record<string, unknown> = { status: map.status, updated_at: new Date().toISOString() };
      if (map.paid) upd.paid_at = payment.paymentDate || payment.confirmedDate || new Date().toISOString();

      let res;
      if (dealPaymentId) {
        res = await supabase.from("deal_payments").update(upd).eq("id", dealPaymentId).select("id");
      } else if (asaasPaymentId) {
        res = await supabase.from("deal_payments").update(upd).eq("asaas_payment_id", asaasPaymentId).select("id");
      }
      applied = !!(res && res.data && res.data.length > 0);
    }

    if (logRow?.id) {
      await supabase.from("asaas_webhooks").update({ processed: true }).eq("id", logRow.id);
    }

    console.log(`[asaas-webhook] event=${event} payment=${asaasPaymentId} applied=${applied}`);
    return ok({ received: true, applied });
  } catch (e) {
    console.error("[asaas-webhook] erro:", e);
    // 200 mesmo em erro: evita o Asaas re-enviar em loop; o erro fica logado.
    return ok({ received: true, error: String(e) });
  }
});
