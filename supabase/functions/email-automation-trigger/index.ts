import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface TriggerBody {
  event: string;
  lead_id?: string;
  deal_id?: string;
  organization_id?: string;
  context?: Record<string, any>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: TriggerBody = await req.json();
    const { event, lead_id, deal_id, organization_id, context = {} } = body;

    if (!event) throw new Error("event obrigatório");
    if (!lead_id && !deal_id && !organization_id) {
      throw new Error("precisa de lead_id, deal_id ou organization_id");
    }

    // Resolve lead_id
    let resolvedLeadId = lead_id || null;

    if (!resolvedLeadId && deal_id) {
      const { data: deal } = await supabase
        .from("deals")
        .select("lead_id")
        .eq("id", deal_id)
        .single();
      resolvedLeadId = deal?.lead_id || null;
    }

    if (!resolvedLeadId && organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("primary_contact_id")
        .eq("id", organization_id)
        .single();
      resolvedLeadId = org?.primary_contact_id || null;
    }

    if (!resolvedLeadId) {
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no lead resolved" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca o tenant do lead pra propagar nos runs (service_role → tenant_id NULL por padrão)
    const { data: leadRow } = await supabase
      .from("leads")
      .select("tenant_id")
      .eq("id", resolvedLeadId)
      .single();

    // Busca automações ativas pra este evento
    const { data: automations } = await supabase
      .from("email_flow_automations")
      .select("id, trigger_event, trigger_filter, flow_json")
      .eq("is_active", true)
      .eq("trigger_event", event);

    if (!automations || automations.length === 0) {
      return new Response(JSON.stringify({ ok: true, triggered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let triggered = 0;
    for (const auto of automations) {
      const flow = auto.flow_json || {};
      const nodes = flow.nodes || [];
      const triggerNode = nodes.find((n: any) => n.type === "trigger");
      if (!triggerNode) continue;

      const filter = auto.trigger_filter || {};
      let matches = true;
      if (filter.pipeline_id && context.pipeline_id !== filter.pipeline_id) matches = false;
      if (filter.stage_id && context.stage_id !== filter.stage_id) matches = false;
      if (filter.source && context.source !== filter.source) matches = false;
      if (!matches) continue;

      const { error } = await supabase
        .from("email_flow_runs")
        .insert({
          tenant_id: leadRow?.tenant_id,
          automation_id: auto.id,
          lead_id: resolvedLeadId,
          current_node_id: triggerNode.id,
          scheduled_next_at: new Date().toISOString(),
          status: "active",
          context: { trigger_event: event, ...context },
        });

      if (!error) triggered++;
    }

    return new Response(JSON.stringify({ ok: true, triggered, total_automations: automations.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
