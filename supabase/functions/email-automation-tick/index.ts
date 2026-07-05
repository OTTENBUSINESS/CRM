import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/**
 * Render simples de JSON Maily/TipTap pra HTML.
 * Não tem todos os blocos avançados (button, columns) mas cobre texto + variáveis básicas.
 * Pra renders complexos, recomenda-se enviar pelo client (que usa @maily-to/render).
 */
function renderJsonToHtml(node: any): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(renderJsonToHtml).join("");
  if (typeof node === "string") return node;

  const type = node.type;
  const text = node.text;
  const content = node.content;
  const attrs = node.attrs || {};

  // Nodes com texto direto
  if (type === "text") {
    let result = (text || "").replace(/[&<>]/g, (c: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as any)[c]);
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "bold") result = `<strong>${result}</strong>`;
        if (mark.type === "italic") result = `<em>${result}</em>`;
        if (mark.type === "underline") result = `<u>${result}</u>`;
        if (mark.type === "code") result = `<code>${result}</code>`;
        if (mark.type === "link") result = `<a href="${mark.attrs?.href || '#'}">${result}</a>`;
      }
    }
    return result;
  }

  const inner = renderJsonToHtml(content);
  const align = attrs.textAlign ? ` style="text-align:${attrs.textAlign};"` : "";

  switch (type) {
    case "doc": return `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;">${inner}</body></html>`;
    case "paragraph": return `<p${align}>${inner}</p>`;
    case "heading": return `<h${attrs.level || 1}${align}>${inner}</h${attrs.level || 1}>`;
    case "bulletList": return `<ul>${inner}</ul>`;
    case "orderedList": return `<ol>${inner}</ol>`;
    case "listItem": return `<li>${inner}</li>`;
    case "horizontalRule": return `<hr/>`;
    case "image": return `<img src="${attrs.src || ''}" alt="${attrs.alt || ''}" style="max-width:100%;"/>`;
    case "button": {
      const url = attrs.url || "#";
      const txt = attrs.text || "Clique aqui";
      const bg = attrs.backgroundColor || "#BAA05E";
      return `<table role="presentation" style="margin:24px 0;"><tr><td style="background:${bg};padding:12px 24px;border-radius:8px;"><a href="${url}" style="color:white;text-decoration:none;font-weight:600;">${txt}</a></td></tr></table>`;
    }
    case "spacer": return `<div style="height:${attrs.height || 16}px;"></div>`;
    case "variable": return `{{${attrs.id || attrs.name || ''}}}`;
    default: return inner;
  }
}

interface FlowNode {
  id: string;
  type: string;
  data: any;
  position: { x: number; y: number };
}
interface FlowEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

function getNextNode(flow: any, fromNodeId: string, branch?: 'yes' | 'no'): FlowNode | null {
  const edges: FlowEdge[] = flow.edges || [];
  const nodes: FlowNode[] = flow.nodes || [];
  const candidates = edges.filter((e) => e.source === fromNodeId);
  let match: FlowEdge | undefined;
  if (branch) match = candidates.find((e) => e.sourceHandle === branch);
  if (!match) match = candidates[0];
  if (!match) return null;
  return nodes.find((n) => n.id === match!.target) || null;
}

function calculateWaitDate(duration: number, unit: string): Date {
  const date = new Date();
  if (unit === "minutos") date.setMinutes(date.getMinutes() + duration);
  else if (unit === "horas") date.setHours(date.getHours() + duration);
  else date.setDate(date.getDate() + duration); // dias
  return date;
}

async function evaluateBranch(supabase: any, leadId: string, condition: any): Promise<boolean> {
  const field = condition.condition_field;
  const op = condition.condition_op || "=";
  const value = condition.condition_value;
  if (!field) return true;

  // Busca valor atual do lead
  let currentValue: any = null;
  if (field === "email_opened" || field === "email_clicked") {
    const { count } = await supabase
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .not(field === "email_opened" ? "opened_at" : "clicked_at", "is", null);
    currentValue = (count || 0) > 0;
  } else if (field === "has_tag") {
    // TODO: integrar com tabela de tags quando criada
    currentValue = false;
  } else {
    const { data: lead } = await supabase.from("leads").select(field).eq("id", leadId).single();
    currentValue = lead?.[field];
  }

  switch (op) {
    case "=":  return String(currentValue) === String(value);
    case "!=": return String(currentValue) !== String(value);
    case ">":  return Number(currentValue) > Number(value);
    case "<":  return Number(currentValue) < Number(value);
    default:   return false;
  }
}

async function executeNode(
  supabase: any,
  run: any,
  node: FlowNode,
): Promise<{ done: boolean; nextNodeId?: string; nextAt?: Date; status?: string }> {
  const leadId = run.lead_id;

  switch (node.type) {
    case "trigger": {
      // Trigger só passa pro próximo
      const next = getNextNode(run.flow, node.id);
      return { done: false, nextNodeId: next?.id, nextAt: new Date() };
    }

    case "wait": {
      const duration = node.data.duration || 1;
      const unit = node.data.unit || "dias";
      const next = getNextNode(run.flow, node.id);
      if (!next) return { done: true, status: "completed" };
      // Marca o próximo node mas só executa após o tempo
      return { done: false, nextNodeId: next.id, nextAt: calculateWaitDate(duration, unit) };
    }

    case "sendEmail": {
      const templateId = node.data.template_id;
      if (!templateId) {
        console.warn(`[run ${run.id}] sendEmail sem template_id`);
        const next = getNextNode(run.flow, node.id);
        return { done: false, nextNodeId: next?.id, nextAt: new Date() };
      }
      // Busca template
      const { data: template } = await supabase
        .from("email_templates").select("id, name, subject, html_content, design_json")
        .eq("id", templateId).single();
      if (!template) {
        console.warn(`[run ${run.id}] template ${templateId} não encontrado`);
        const next = getNextNode(run.flow, node.id);
        return { done: false, nextNodeId: next?.id, nextAt: new Date() };
      }
      // Busca lead pra ter email
      const { data: lead } = await supabase
        .from("leads").select("id, name, email").eq("id", leadId).single();
      if (!lead?.email) {
        console.warn(`[run ${run.id}] lead ${leadId} sem email`);
        const next = getNextNode(run.flow, node.id);
        return { done: false, nextNodeId: next?.id, nextAt: new Date() };
      }

      // HTML: prioriza o html_content já renderizado pelo Maily render no client.
      // Fallback: render simples (caso template antigo sem html_content).
      const html = template.html_content || renderJsonToHtml(template.design_json);

      // Cria campanha ad-hoc temp pra reutilizar send-email-campaign
      // (mantém histórico em email_campaigns + email_sends como single-recipient)
      // source_type='automation' + automation_id permite filtrar das campanhas reais
      const { data: tempCampaign, error: campErr } = await supabase
        .from("email_campaigns")
        .insert({
          tenant_id: run.tenant_id,
          name: `[Auto] ${template.name}`,
          subject: node.data.subject || template.subject || "(sem assunto)",
          template_id: templateId,
          html_content: html,
          status: "draft",
          source_type: "automation",
          automation_id: run.automation_id,
          audience_filters: { lead_ids: [leadId], automation_run_id: run.id },
        })
        .select("id")
        .single();

      if (campErr || !tempCampaign) {
        console.error(`[run ${run.id}] insert email_campaigns falhou:`, campErr);
        const next = getNextNode(run.flow, node.id);
        return { done: false, nextNodeId: next?.id, nextAt: new Date() };
      }

      // Dispara send-email-campaign com audience_override pra garantir envio só pro lead
      const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email-campaign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          campaign_id: tempCampaign.id,
          html,
          audience_override: { lead_ids: [leadId] },
        }),
      });
      if (!fnRes.ok) {
        console.error(`[run ${run.id}] send-email-campaign failed:`, await fnRes.text());
      }

      const next = getNextNode(run.flow, node.id);
      return { done: false, nextNodeId: next?.id, nextAt: new Date() };
    }

    case "updateField": {
      const field = node.data.field;
      const value = node.data.value;
      if (field && value !== undefined) {
        await supabase.from("leads").update({ [field]: value }).eq("id", leadId);
      }
      const next = getNextNode(run.flow, node.id);
      return { done: false, nextNodeId: next?.id, nextAt: new Date() };
    }

    case "addTag": {
      const tag = node.data.tag;
      if (tag) {
        // Busca tags atuais e adiciona
        const { data: lead } = await supabase.from("leads").select("tags").eq("id", leadId).single();
        const current = (lead?.tags || []) as string[];
        if (!current.includes(tag)) {
          await supabase.from("leads").update({ tags: [...current, tag] }).eq("id", leadId);
        }
      }
      const next = getNextNode(run.flow, node.id);
      return { done: false, nextNodeId: next?.id, nextAt: new Date() };
    }

    case "createTask": {
      const title = node.data.title || "Tarefa automática";
      const team = node.data.team || "comercial";
      await supabase.from("company_activities").insert({
        tenant_id: run.tenant_id,
        name: title,
        team,
        lead_id: leadId,
        scheduled_at: new Date().toISOString(),
        completed: false,
        task_type: "follow_up",
        metadata: { automation_run_id: run.id },
      });
      const next = getNextNode(run.flow, node.id);
      return { done: false, nextNodeId: next?.id, nextAt: new Date() };
    }

    case "branch": {
      const result = await evaluateBranch(supabase, leadId, node.data);
      const handle = result ? "yes" : "no";
      const next = getNextNode(run.flow, node.id, handle);
      if (!next) return { done: true, status: "completed" };
      return { done: false, nextNodeId: next.id, nextAt: new Date() };
    }

    case "sendWhatsapp": {
      const message = node.data.message || "";
      if (message) {
        const { data: lead } = await supabase.from("leads").select("phone, name").eq("id", leadId).single();
        if (lead?.phone) {
          // Substitui variáveis básicas
          const text = message
            .replace(/\{\{nome\}\}/g, lead.name || "")
            .replace(/\{\{primeiro_nome\}\}/g, lead.name?.split(" ")[0] || "");
          // Pega instância ativa
          const { data: instance } = await supabase
            .from("whatsapp_instances")
            .select("api_url, api_key")
            .eq("status", "connected")
            .limit(1)
            .maybeSingle();
          if (instance) {
            try {
              await fetch(`${instance.api_url}/send/text`, {
                method: "POST",
                headers: { "Content-Type": "application/json", token: instance.api_key },
                body: JSON.stringify({ number: lead.phone, text }),
              });
            } catch (e) {
              console.error("Erro WhatsApp:", e);
            }
          }
        }
      }
      const next = getNextNode(run.flow, node.id);
      return { done: false, nextNodeId: next?.id, nextAt: new Date() };
    }

    case "end": {
      return { done: true, status: "completed" };
    }

    default: {
      console.warn(`Node type desconhecido: ${node.type}`);
      const next = getNextNode(run.flow, node.id);
      return { done: false, nextNodeId: next?.id, nextAt: new Date() };
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pega runs prontos pra executar
    const { data: runs } = await supabase
      .from("email_flow_runs")
      .select("id, tenant_id, automation_id, lead_id, current_node_id, scheduled_next_at, status, context, automation:email_flow_automations(flow_json, is_active)")
      .eq("status", "active")
      .lte("scheduled_next_at", new Date().toISOString())
      .limit(50);

    if (!runs || runs.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let completed = 0;

    for (const run of runs) {
      const flow = (run as any).automation?.flow_json;
      const isActive = (run as any).automation?.is_active;
      if (!flow || !isActive) {
        await supabase
          .from("email_flow_runs")
          .update({ status: "cancelled", completed_at: new Date().toISOString() })
          .eq("id", run.id);
        continue;
      }

      const nodes: FlowNode[] = flow.nodes || [];
      const node = nodes.find((n) => n.id === run.current_node_id);
      if (!node) {
        await supabase
          .from("email_flow_runs")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", run.id);
        continue;
      }

      try {
        const result = await executeNode(supabase, { ...run, flow }, node);
        if (result.done) {
          await supabase
            .from("email_flow_runs")
            .update({
              status: result.status || "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", run.id);
          completed++;
        } else if (result.nextNodeId) {
          await supabase
            .from("email_flow_runs")
            .update({
              current_node_id: result.nextNodeId,
              scheduled_next_at: (result.nextAt || new Date()).toISOString(),
            })
            .eq("id", run.id);
        } else {
          // Não tem próximo — encerra
          await supabase
            .from("email_flow_runs")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", run.id);
          completed++;
        }
        processed++;
      } catch (err: any) {
        console.error(`Erro run ${run.id}:`, err);
        await supabase
          .from("email_flow_runs")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", run.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, completed, total: runs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
