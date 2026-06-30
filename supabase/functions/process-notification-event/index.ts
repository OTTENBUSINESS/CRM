import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isAuthorizedCaller, unauthorizedResponse } from "../_shared/requireCaller.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface NotificationRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_event: string;
  action_channel: string;
  action_target_id: string | null;
  action_instance_id: string | null;
  message_template: string;
  enabled: boolean;
}

interface WhatsAppInstance {
  id: string;
  name: string;
  api_key: string;
  api_url: string;
}

interface EventContext {
  // Deal data
  deal_id?: string;
  deal_titulo?: string;
  deal_produto?: string;
  deal_valor?: number;
  deal_valor_original?: number;
  deal_desconto?: number;
  deal_pagamento?: string;
  deal_parcelas?: number;
  deal_etapa?: string;
  deal_previsao?: string;
  deal_observacao?: string;
  deal_motivo_perda?: string;
  deal_vendedor?: string;
  deal_vendedor_telefone?: string;
  deal_probabilidade?: number;
  deal_utm_source?: string;
  deal_utm_campaign?: string;
  // Lead/Cliente data
  cliente?: string;
  cliente_telefone?: string;
  cliente_email?: string;
  cliente_empresa?: string;
  lead_origem?: string;
  lead_campanha?: string;
  lead_conteudo?: string;
  lead_score?: number;
  lead_id?: string;
  lead_context?: string;
  // General
  responsavel?: string;
  responsavel_telefone?: string;
  // Meeting data
  meeting_data?: string;
  meeting_hora?: string;
  meeting_tipo?: string;
  meeting_notas?: string;
  meeting_source?: string; // 'manual' | 'ai_agent' | 'bot'
  // Reschedule data
  meeting_data_anterior?: string;
  meeting_hora_anterior?: string;
}

/**
 * Formata número de telefone para envio via UAZAPI
 */
function formatPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (!cleaned.startsWith("55") && cleaned.length <= 11) {
    cleaned = "55" + cleaned;
  }
  return cleaned;
}

/**
 * Formata valor monetário
 */
function formatCurrency(value: number | undefined | null): string {
  if (!value) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Formata data para exibição
 */
function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR");
}

/**
 * Substitui variáveis no template
 */
function replaceTemplateVariables(template: string, context: EventContext): string {
  const now = new Date();

  let message = template
    // Gerais
    .replace(/\{\{data\}\}/g, now.toLocaleDateString("pt-BR"))
    .replace(/\{\{hora\}\}/g, now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
    .replace(/\{\{responsavel\}\}/g, context.responsavel || context.deal_vendedor || "-")
    // Lead/Cliente
    .replace(/\{\{cliente\}\}/g, context.cliente || "-")
    .replace(/\{\{cliente_telefone\}\}/g, context.cliente_telefone || "-")
    .replace(/\{\{cliente_email\}\}/g, context.cliente_email || "-")
    .replace(/\{\{cliente_empresa\}\}/g, context.cliente_empresa || "-")
    .replace(/\{\{lead_origem\}\}/g, context.lead_origem || "-")
    .replace(/\{\{lead_campanha\}\}/g, context.lead_campanha || "-")
    .replace(/\{\{lead_conteudo\}\}/g, context.lead_conteudo || "-")
    .replace(/\{\{lead_score\}\}/g, context.lead_score?.toString() || "-")
    .replace(/\{\{lead_context\}\}/g, context.lead_context || "-")
    // Deal
    .replace(/\{\{deal_titulo\}\}/g, context.deal_titulo || "-")
    .replace(/\{\{deal_produto\}\}/g, context.deal_produto || "-")
    .replace(/\{\{deal_valor\}\}/g, formatCurrency(context.deal_valor))
    .replace(/\{\{deal_valor_original\}\}/g, formatCurrency(context.deal_valor_original))
    .replace(/\{\{deal_desconto\}\}/g, context.deal_desconto ? `${context.deal_desconto}%` : "-")
    .replace(/\{\{deal_pagamento\}\}/g, context.deal_pagamento || "-")
    .replace(/\{\{deal_parcelas\}\}/g, context.deal_parcelas?.toString() || "-")
    .replace(/\{\{deal_etapa\}\}/g, context.deal_etapa || "-")
    .replace(/\{\{deal_previsao\}\}/g, formatDate(context.deal_previsao))
    .replace(/\{\{deal_observacao\}\}/g, context.deal_observacao || "-")
    .replace(/\{\{deal_motivo_perda\}\}/g, context.deal_motivo_perda || "-")
    .replace(/\{\{deal_vendedor\}\}/g, context.deal_vendedor || "-")
    .replace(/\{\{deal_probabilidade\}\}/g, context.deal_probabilidade ? `${context.deal_probabilidade}%` : "-")
    .replace(/\{\{deal_utm_source\}\}/g, context.deal_utm_source || "-")
    .replace(/\{\{deal_utm_campaign\}\}/g, context.deal_utm_campaign || "-")
    // Meeting
    .replace(/\{\{meeting_data\}\}/g, context.meeting_data || "-")
    .replace(/\{\{meeting_hora\}\}/g, context.meeting_hora || "-")
    .replace(/\{\{meeting_tipo\}\}/g, context.meeting_tipo || "-")
    .replace(/\{\{meeting_notas\}\}/g, (context.meeting_notas || "").slice(0, 200))
    .replace(/\{\{meeting_source\}\}/g,
      context.meeting_source === 'ai_agent' ? 'Agente IA'
      : context.meeting_source === 'bot' ? 'Carol (bot)'
      : 'vendedor')
    .replace(/\{\{agendado_por\}\}/g, context.agendado_por || context.responsavel || "-")
    // Reschedule
    .replace(/\{\{meeting_data_anterior\}\}/g, context.meeting_data_anterior || "-")
    .replace(/\{\{meeting_hora_anterior\}\}/g, context.meeting_hora_anterior || "-");

  return message;
}

/**
 * Envia mensagem WhatsApp via UAZAPI
 */
async function sendWhatsApp(
  instance: WhatsAppInstance,
  targetNumber: string,
  message: string
): Promise<boolean> {
  try {
    const apiUrl = `${instance.api_url}/send/text`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "token": instance.api_key,
      },
      body: JSON.stringify({
        number: targetNumber,
        text: message,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`✅ WhatsApp enviado para ${targetNumber}`);
      return true;
    } else {
      console.error(`❌ Erro ao enviar WhatsApp:`, result);
      return false;
    }
  } catch (error) {
    console.error(`❌ Exceção ao enviar WhatsApp:`, error);
    return false;
  }
}

/**
 * Mapeia evento para contexto de frase motivacional
 */
function mapEventToQuoteContext(eventType: string): string {
  const map: Record<string, string> = {
    deal_won: "after_win",
    deal_lost: "after_loss",
    deal_created: "morning",
    deal_proposal_sent: "before_call",
    deal_stage_changed: "morning",
    lead_created: "morning",
    lead_qualified: "morning",
    lead_hot: "before_call",
    task_created: "accountability",
    task_completed: "after_win",
    onboarding_scheduled: "before_call",
    onboarding_completed: "after_win",
    onboarding_midpoint: "after_win",
    testimonial_received: "after_win",
    meeting_scheduled: "before_call",
    meeting_confirmed: "before_call",
    meeting_rescheduled: "accountability",
  };
  return map[eventType] || "morning";
}

/**
 * Busca frase motivacional via RPC
 */
async function getMotivationalQuote(
  supabase: any,
  context: string
): Promise<{ quote: string; source: string; category: string } | null> {
  try {
    const { data, error } = await supabase.rpc("get_motivational_quote", {
      p_context: context,
    });
    if (error || !data || data.length === 0) return null;
    return data[0];
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "OPTIONS" && !isAuthorizedCaller(req)) return unauthorizedResponse();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    const { event_type, context } = body as {
      event_type: string;
      context: EventContext;
    };

    if (!event_type) {
      return new Response(
        JSON.stringify({ error: "event_type é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`🔔 Processando evento: ${event_type}`);
    console.log(`📋 Contexto:`, context);

    // Buscar regras de notificação ativas para este evento
    const { data: rules, error: rulesError } = await supabase
      .from("notification_rules")
      .select("*")
      .eq("enabled", true)
      .eq("trigger_type", "on_event")
      .eq("trigger_event", event_type);

    if (rulesError) {
      console.error("❌ Erro ao buscar regras:", rulesError);
      return new Response(
        JSON.stringify({ error: rulesError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    console.log(`📋 Encontradas ${rules?.length || 0} regras para o evento ${event_type}`);

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notifications_sent: 0, message: "Nenhuma regra configurada para este evento" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = {
      processed: 0,
      sent: 0,
      errors: [] as string[],
    };

    for (const rule of rules as NotificationRule[]) {
      results.processed++;
      console.log(`\n📤 Processando regra: ${rule.name}`);

      // Buscar instância WhatsApp
      if (!rule.action_instance_id) {
        console.log(`⚠️ Regra ${rule.name}: sem instância configurada`);
        results.errors.push(`Regra ${rule.name}: sem instância WhatsApp configurada`);
        continue;
      }

      const { data: instance, error: instanceError } = await supabase
        .from("whatsapp_instances")
        .select("id, name, api_key, api_url")
        .eq("id", rule.action_instance_id)
        .eq("status", "connected")
        .single();

      if (instanceError || !instance) {
        console.log(`⚠️ Regra ${rule.name}: instância não encontrada ou desconectada`);
        results.errors.push(`Regra ${rule.name}: instância WhatsApp não disponível`);
        continue;
      }

      // Determinar número de destino baseado no canal
      let targetNumber: string | null = null;

      if (rule.action_channel === "whatsapp_group") {
        // action_target_id contém o group_jid
        targetNumber = rule.action_target_id;
      } else if (rule.action_channel === "whatsapp_user") {
        // Enviar para o responsável/vendedor
        targetNumber = context.responsavel_telefone || context.deal_vendedor_telefone;
        if (targetNumber) {
          targetNumber = formatPhone(targetNumber);
        }
      } else if (rule.action_channel === "whatsapp_client") {
        // Enviar para o cliente
        targetNumber = context.cliente_telefone;
        if (targetNumber) {
          targetNumber = formatPhone(targetNumber);
        }
      }

      if (!targetNumber) {
        console.log(`⚠️ Regra ${rule.name}: sem número de destino`);
        results.errors.push(`Regra ${rule.name}: número de destino não disponível`);
        continue;
      }

      // Substituir variáveis no template
      let message = replaceTemplateVariables(rule.message_template, context);

      // Limpar linhas que ficaram só com "-" ou "não informado" após substituição
      message = message
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          // Remove linhas que terminam com ": -" ou ": não informado" ou são só "-"
          if (/:\s*-\s*$/.test(trimmed)) return false;
          if (/:\s*não informado\s*$/i.test(trimmed)) return false;
          if (trimmed === '-' || trimmed === '- |' || trimmed === '|') return false;
          return true;
        })
        .join('\n')
        // Limpar múltiplas quebras de linha consecutivas
        .replace(/\n{3,}/g, '\n\n');

      // Enviar mensagem
      const sent = await sendWhatsApp(instance as WhatsAppInstance, targetNumber, message);

      if (sent) {
        results.sent++;
        console.log(`✅ Notificação enviada: ${rule.name}`);
      } else {
        results.errors.push(`Regra ${rule.name}: falha ao enviar WhatsApp`);
      }
    }

    console.log(`\n✅ Processamento concluído:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        event_type,
        ...results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Erro no processamento:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
