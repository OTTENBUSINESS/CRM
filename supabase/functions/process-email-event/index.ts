import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getEmailConfig } from "../_shared/tenant-email-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/**
 * Valida assinatura Svix do webhook do Resend, lendo o secret singleton.
 * Se não tiver secret configurado, aceita (modo permissivo).
 */
async function verifySvixSignature(
  body: string,
  webhookSecret: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
): Promise<boolean> {
  if (!webhookSecret) return true; // tenant sem secret → modo permissivo
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  try {
    const secret = webhookSecret.replace(/^whsec_/, "");
    const secretBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));

    const toSign = `${svixId}.${svixTimestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
    const computed = btoa(String.fromCharCode(...new Uint8Array(signed)));

    const sigs = svixSignature.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
    return sigs.includes(computed);
  } catch (e) {
    console.error("Erro validando Svix:", e);
    return false;
  }
}

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    headers?: Array<{ name: string; value: string }>;
    bounce?: { message?: string; subType?: string };
    click?: { link?: string };
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const rawBody = await req.text();
    const event: ResendWebhookEvent = JSON.parse(rawBody);
    const eventType = event.type;
    const resendId = event.data?.email_id;
    if (!resendId) {
      return new Response(JSON.stringify({ error: "email_id missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca send pelo resend_id
    const { data: send } = await supabase
      .from("email_sends")
      .select("id, campaign_id, lead_id, email, status, open_count, click_count, tenant_id")
      .eq("resend_id", resendId)
      .maybeSingle();

    if (!send) {
      console.warn("Send not found for resend_id:", resendId);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pega webhook secret pra validar assinatura
    const emailCfg = await getEmailConfig(supabase);

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    const valid = await verifySvixSignature(
      rawBody,
      emailCfg?.resend_webhook_secret || "",
      svixId,
      svixTimestamp,
      svixSignature,
    );
    if (!valid) {
      console.warn("Webhook signature inválida");
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Registra evento bruto pra auditoria
    await supabase.from("email_events").insert({
      tenant_id: send.tenant_id,
      send_id: send.id,
      event_type: eventType,
      payload: event,
    });

    const now = new Date().toISOString();
    const updates: Record<string, any> = {};
    const campaignDelta: Record<string, number> = {};

    switch (eventType) {
      case "email.sent":
        if (send.status === "pending") updates.status = "sent";
        if (!updates.sent_at) updates.sent_at = now;
        break;

      case "email.delivered":
        updates.status = "delivered";
        updates.delivered_at = now;
        campaignDelta.delivered_count = 1;
        break;

      case "email.opened":
        if (send.status !== "clicked" && send.status !== "bounced") {
          updates.status = "opened";
        }
        if (!send.open_count || send.open_count === 0) {
          updates.opened_at = now;
          campaignDelta.opened_count = 1;
        }
        updates.open_count = (send.open_count || 0) + 1;
        break;

      case "email.clicked":
        updates.status = "clicked";
        if (!send.click_count || send.click_count === 0) {
          updates.clicked_at = now;
          campaignDelta.clicked_count = 1;
        }
        updates.click_count = (send.click_count || 0) + 1;
        if (event.data.click?.link) updates.clicked_url = event.data.click.link;
        break;

      case "email.bounced":
        updates.status = "bounced";
        updates.bounced_at = now;
        updates.bounce_reason = event.data.bounce?.message || event.data.bounce?.subType || "Unknown";
        campaignDelta.bounced_count = 1;
        if (event.data.to?.[0]) {
          await supabase
            .from("email_subscribers")
            .upsert({
              tenant_id: send.tenant_id,
              email: event.data.to[0],
              lead_id: send.lead_id,
              status: "bounced",
              bounce_reason: updates.bounce_reason,
            }, { onConflict: "tenant_id,email" });
        }
        break;

      case "email.complained":
        updates.status = "complained";
        if (event.data.to?.[0]) {
          await supabase
            .from("email_subscribers")
            .upsert({
              tenant_id: send.tenant_id,
              email: event.data.to[0],
              lead_id: send.lead_id,
              status: "complained",
              unsubscribed_at: now,
            }, { onConflict: "tenant_id,email" });
        }
        break;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("email_sends").update(updates).eq("id", send.id);
    }

    // Espelha pra email_campaign_leads (que é o que a UI da campanha lê)
    if (send.campaign_id && Object.keys(updates).length > 0) {
      const eclUpdates: Record<string, any> = { ...updates };
      // bounce_reason vai como error_message em campaign_leads
      if (eclUpdates.bounce_reason) {
        eclUpdates.error_message = eclUpdates.bounce_reason;
        delete eclUpdates.bounce_reason;
      }
      await supabase
        .from("email_campaign_leads")
        .update(eclUpdates)
        .eq("campaign_id", send.campaign_id)
        .eq("email", send.email);
    }

    if (send.campaign_id && Object.keys(campaignDelta).length > 0) {
      const { data: campaign } = await supabase
        .from("email_campaigns")
        .select("delivered_count, opened_count, clicked_count, bounced_count")
        .eq("id", send.campaign_id)
        .single();

      if (campaign) {
        const campaignUpdates: Record<string, any> = {};
        for (const [k, v] of Object.entries(campaignDelta)) {
          campaignUpdates[k] = ((campaign as any)[k] || 0) + v;
        }
        await supabase
          .from("email_campaigns")
          .update(campaignUpdates)
          .eq("id", send.campaign_id);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
