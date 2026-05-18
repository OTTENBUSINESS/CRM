import { supabase } from "@/lib/supabase";

export type NotificationEventType =
  | "deal_created"
  | "deal_won"
  | "deal_lost"
  | "deal_proposal_sent"
  | "deal_stage_changed"
  | "lead_created"
  | "lead_qualified"
  | "lead_hot"
  | "task_created"
  | "task_completed"
  | "onboarding_scheduled"
  | "onboarding_completed"
  | "meeting_scheduled"
  | "meeting_confirmed"
  | "meeting_rescheduled"
  | "onboarding_midpoint"
  | "testimonial_received";

export interface NotificationContext {
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
  agendado_por?: string; // Who scheduled (person name or 'Agente IA')
  // Reschedule data
  meeting_data_anterior?: string;
  meeting_hora_anterior?: string;
}

/**
 * Dispara evento de notificação para a edge function
 * Não bloqueia - erros são apenas logados
 */
export async function triggerNotificationEvent(
  eventType: NotificationEventType,
  context: NotificationContext
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("process-notification-event", {
      body: {
        event_type: eventType,
        context,
      },
    });

    if (error) {
      console.error(`Error dispatching notification: ${eventType}`);
    }
  } catch (err) {
    // Não propagar erro - notificação é auxiliar
    console.error(`Exception dispatching notification: ${eventType}`);
  }
}

/**
 * Busca dados completos do deal para notificação
 */
export async function getDealNotificationContext(dealId: string): Promise<NotificationContext | null> {
  try {
    const { data: deal, error } = await supabase
      .from("deals")
      .select(`
        id,
        title,
        negotiated_price,
        original_price,
        discount_percent,
        payment_method,
        installments,
        expected_close_date,
        notes,
        lost_reason,
        ai_win_probability,
        utm_source,
        utm_campaign,
        lead:leads!deals_lead_id_fkey(
          id,
          name,
          email,
          phone,
          company_name,
          sales_score,
          utm_source,
          utm_campaign,
          utm_content,
          context
        ),
        product:products!deals_product_id_fkey(name),
        pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(name),
        sales_rep:team_members!deals_sales_rep_id_fkey(
          name,
          phone
        )
      `)
      .eq("id", dealId)
      .single();

    if (error || !deal) {
      console.error("Error fetching deal for notification");
      return null;
    }

    const lead = deal.lead as any;
    const salesRep = deal.sales_rep as any;
    const product = deal.product as any;
    const stage = deal.pipeline_stage as any;

    return {
      deal_id: deal.id,
      deal_titulo: deal.title || product?.name || "-",
      deal_produto: product?.name || "-",
      deal_valor: Number(deal.negotiated_price) || 0,
      deal_valor_original: Number(deal.original_price) || 0,
      deal_desconto: Number(deal.discount_percent) || 0,
      deal_pagamento: deal.payment_method || "-",
      deal_parcelas: deal.installments || 1,
      deal_etapa: stage?.name || "-",
      deal_previsao: deal.expected_close_date,
      deal_observacao: deal.notes || "-",
      deal_motivo_perda: deal.lost_reason || "-",
      deal_vendedor: salesRep?.name || "-",
      deal_vendedor_telefone: salesRep?.phone || null,
      deal_probabilidade: deal.ai_win_probability || 0,
      deal_utm_source: deal.utm_source || "-",
      deal_utm_campaign: deal.utm_campaign || "-",
      // Lead/Cliente
      cliente: lead?.name || "-",
      cliente_telefone: lead?.phone || null,
      cliente_email: lead?.email || "-",
      cliente_empresa: lead?.company_name || "-",
      lead_origem: lead?.utm_source || "-",
      lead_campanha: lead?.utm_campaign || "-",
      lead_conteudo: lead?.utm_content || "-",
      lead_score: lead?.sales_score || 0,
      lead_id: lead?.id,
      lead_context: lead?.context || "-",
      // Geral
      responsavel: salesRep?.name || "-",
      responsavel_telefone: salesRep?.phone || null,
    };
  } catch (err) {
    console.error("Exception fetching deal context");
    return null;
  }
}

/**
 * Dispara regras de automação para um evento (fire-and-forget)
 */
export async function triggerAutomationRules(event: {
  trigger_type: 'task_created' | 'task_completed' | 'deal_created' | 'deal_stage_changed' | 'lead_score_changed' | 'lead_replied' | 'meeting_scheduled' | 'meeting_completed' | 'meeting_no_show';
  deal_id?: string;
  lead_id?: string;
  task_id?: string;
  task_type?: string;
  has_scheduled_date?: boolean;
  stage_id?: string;
  previous_stage_id?: string;
  lead_score?: number;
  previous_lead_score?: number;
}): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("process-automation-rules", {
      body: event,
    });
    if (error) {
      console.error(`Error dispatching automation rules: ${event.trigger_type}`);
    }
  } catch (err) {
    console.error(`Exception dispatching automation rules: ${event.trigger_type}`);
  }
}

/**
 * Busca dados completos do lead para notificação
 */
export async function getLeadNotificationContext(leadId: string): Promise<NotificationContext | null> {
  try {
    const { data: lead, error } = await supabase
      .from("leads")
      .select(`
        id,
        name,
        email,
        phone,
        company_name,
        sales_score,
        utm_source,
        utm_campaign,
        utm_content,
        context,
        sales_stage
      `)
      .eq("id", leadId)
      .single();

    if (error || !lead) {
      console.error("Error fetching lead for notification");
      return null;
    }

    return {
      lead_id: lead.id,
      cliente: lead.name || "-",
      cliente_telefone: lead.phone || null,
      cliente_email: lead.email || "-",
      cliente_empresa: lead.company_name || "-",
      lead_origem: lead.utm_source || "-",
      lead_campanha: lead.utm_campaign || "-",
      lead_conteudo: lead.utm_content || "-",
      lead_score: lead.sales_score || 0,
      lead_context: lead.context || "-",
    };
  } catch (err) {
    console.error("Exception fetching lead context");
    return null;
  }
}
