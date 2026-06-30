import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isAuthorizedCaller, unauthorizedResponse } from "../_shared/requireCaller.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_event?: string;
  trigger_minutes?: number;
  trigger_time?: string;
  action_channel: string;
  action_target_id?: string;
  action_instance_id?: string;
  message_template: string;
  enabled: boolean;
}

interface Task {
  id: string;
  name?: string;
  title?: string;
  task_type?: string;
  notes?: string;
  priority?: string;
  scheduled_at?: string;
  due_datetime?: string;
  meeting_link?: string;
  responsavel_id?: string;
  lead_id?: string;
  organization_id?: string;
  responsavel?: {
    id: string;
    name: string;
    phone?: string;
  };
  lead?: {
    id: string;
    name: string;
    phone?: string;
  };
  organization?: {
    id: string;
    name: string;
    primary_contact?: {
      name: string;
      phone: string;
      email: string;
    };
  };
}

const taskTypeLabels: Record<string, string> = {
  call: "Ligação",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Reunião",
  onboarding: "Onboarding",
  follow_up: "Follow-up",
  support: "Suporte",
  checkin: "Check-in",
  internal: "Interna",
  review: "Revisão",
  renewal: "Renovação",
  upsell: "Upsell",
  rescue: "Resgate",
  nps: "NPS",
};

const taskTypeEmojis: Record<string, string> = {
  call: "📞",
  whatsapp: "💬",
  email: "📧",
  meeting: "🤝",
  onboarding: "🚀",
  follow_up: "🔄",
  support: "🛠️",
  checkin: "✅",
  internal: "📋",
  review: "🔍",
  renewal: "🔁",
  upsell: "📈",
  rescue: "🆘",
  nps: "⭐",
};

const priorityLabels: Record<string, string> = {
  high: "🔴 Alta",
  medium: "🟡 Média",
  low: "🟢 Baixa",
};

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

/** Retorna Date em Brasília (UTC-3) */
function toBrasilia(d: Date): Date {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "OPTIONS" && !isAuthorizedCaller(req)) return unauthorizedResponse();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const now = new Date();
    // Hora atual em Brasília para comparar com trigger_time
    const brNow = toBrasilia(now);
    const currentTimeBRT = brNow.toISOString().slice(11, 16); // HH:MM em BRT
    console.log(`🔔 Processando regras de notificação - ${now.toISOString()} (BRT: ${currentTimeBRT})`);

    const { data: rules, error: rulesError } = await supabase
      .from('notification_rules')
      .select('*')
      .eq('enabled', true);

    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) {
      console.log('Nenhuma regra ativa encontrada');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📋 ${rules.length} regras ativas encontradas`);

    let notificationsSent = 0;

    for (const rule of rules as NotificationRule[]) {
      try {
        // Skip on_event rules - handled by triggers
        if (rule.trigger_type === 'on_event') continue;

        if (rule.trigger_type === 'before_event' || rule.trigger_type === 'after_event') {
          const sent = await processEventBasedRule(supabase, rule, now);
          notificationsSent += sent;
        } else if (rule.trigger_type === 'daily_schedule') {
          if (rule.trigger_time && isTimeMatch(currentTimeBRT, rule.trigger_time)) {
            console.log(`⏰ daily_schedule match: BRT ${currentTimeBRT} ≈ trigger ${rule.trigger_time}`);
            const sent = await processDailyRule(supabase, rule, now);
            notificationsSent += sent;
          }
        }
      } catch (ruleError) {
        const errorMsg = serializeError(ruleError);
        console.error(`Erro ao processar regra ${rule.name}:`, errorMsg);
        await logNotification(supabase, rule, null, 'failed', errorMsg);
      }
    }

    console.log(`✅ Processamento concluído - ${notificationsSent} notificações enviadas`);

    return new Response(
      JSON.stringify({ success: true, processed: notificationsSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMsg = serializeError(error);
    console.error('Erro geral:', errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function isTimeMatch(current: string, target: string): boolean {
  const [currentH, currentM] = current.split(':').map(Number);
  const [targetH, targetM] = target.split(':').map(Number);
  const currentMinutes = currentH * 60 + currentM;
  const targetMinutes = targetH * 60 + targetM;
  return Math.abs(currentMinutes - targetMinutes) <= 5;
}

// ========== BEFORE/AFTER EVENT RULES ==========
async function processEventBasedRule(supabase: any, rule: NotificationRule, now: Date): Promise<number> {
  const triggerMinutes = rule.trigger_minutes || 60;
  const isBefore = rule.trigger_type === 'before_event';

  const windowStart = new Date(now);
  const windowEnd = new Date(now);

  if (isBefore) {
    windowStart.setMinutes(windowStart.getMinutes() + triggerMinutes - 2);
    windowEnd.setMinutes(windowEnd.getMinutes() + triggerMinutes + 2);
  } else {
    windowStart.setMinutes(windowStart.getMinutes() - triggerMinutes - 2);
    windowEnd.setMinutes(windowEnd.getMinutes() - triggerMinutes + 2);
  }

  console.log(`🔍 Regra: ${rule.name}`);
  console.log(`📌 Trigger: ${rule.trigger_event}, Minutos: ${triggerMinutes}, Channel: ${rule.action_channel}`);
  console.log(`📅 Janela: ${windowStart.toISOString()} até ${windowEnd.toISOString()}`);

  const triggerEvent = rule.trigger_event || 'task_scheduled';

  const taskTypeMap: Record<string, string | null> = {
    'task_due': null,
    'task_scheduled': null,
    'onboarding_scheduled': 'onboarding',
    'meeting_scheduled': 'meeting',
    'call_scheduled': 'call',
  };

  const useDueDateTime = triggerEvent === 'task_due';
  const taskTypeFilter = taskTypeMap[triggerEvent];

  let query = supabase
    .from('company_activities')
    .select(`
      *,
      responsavel:team_members!company_activities_responsavel_id_fkey(id, name, phone),
      lead:leads!company_activities_lead_id_fkey(id, name, phone),
      organization:organizations!company_activities_organization_id_fkey(
        id, name,
        primary_contact:leads!organizations_primary_contact_id_fkey(name, phone, email)
      )
    `)
    .eq('completed', false);

  if (taskTypeFilter) {
    query = query.eq('task_type', taskTypeFilter);
  }

  if (useDueDateTime) {
    query = query
      .not('due_datetime', 'is', null)
      .gte('due_datetime', windowStart.toISOString())
      .lte('due_datetime', windowEnd.toISOString());
  } else {
    query = query
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', windowStart.toISOString())
      .lte('scheduled_at', windowEnd.toISOString());
  }

  const { data: tasks, error } = await query;

  if (error) {
    console.error(`❌ Erro na query:`, serializeError(error));
    throw error;
  }

  if (!tasks || tasks.length === 0) {
    return 0;
  }

  console.log(`📅 ${tasks.length} eventos encontrados`);
  let sent = 0;

  for (const task of tasks as Task[]) {
    try {
      const alreadySent = await checkAlreadySent(supabase, rule.id, task.id);
      if (alreadySent) continue;

      const message = formatMessage(rule.message_template, task, useDueDateTime);
      const success = await sendNotification(supabase, rule, task, message);
      if (success) sent++;
    } catch (taskError) {
      const errorMsg = serializeError(taskError);
      console.error(`❌ Erro ao processar tarefa ${task.id}:`, errorMsg);
      await logNotification(supabase, rule, task.id, 'failed', errorMsg);
    }
  }

  return sent;
}

// ========== DAILY SCHEDULE RULE (RESUMO DIÁRIO) ==========
async function processDailyRule(supabase: any, rule: NotificationRule, now: Date): Promise<number> {
  console.log(`📋 Processando regra diária: ${rule.name}`);

  // Range do dia em Brasília: meia-noite BRT = 03:00 UTC
  const brNow = toBrasilia(now);
  const brDateStr = brNow.toISOString().split('T')[0];
  const todayStartUTC = `${brDateStr}T03:00:00.000Z`;
  const nextDate = new Date(brDateStr + 'T00:00:00Z');
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextDay = nextDate.toISOString().split('T')[0];
  const todayEndUTC = `${nextDay}T03:00:00.000Z`;

  console.log(`📅 Range Brasília (${brDateStr}): ${todayStartUTC} → ${todayEndUTC}`);

  // Já enviou hoje?
  const alreadySent = await checkAlreadySentToday(supabase, rule.id, now);
  if (alreadySent) {
    console.log(`⏭️ Resumo diário já enviado hoje`);
    return 0;
  }

  // Buscar tarefas do dia - APENAS scheduled_at, ordenado por horário
  const { data: tasks, error } = await supabase
    .from('company_activities')
    .select(`
      *,
      responsavel:team_members!company_activities_responsavel_id_fkey(id, name, phone),
      lead:leads!company_activities_lead_id_fkey(id, name, phone),
      organization:organizations!company_activities_organization_id_fkey(id, name)
    `)
    .eq('completed', false)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', todayStartUTC)
    .lt('scheduled_at', todayEndUTC)
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error(`❌ Erro na query:`, serializeError(error));
    throw error;
  }

  console.log(`📊 ${tasks?.length || 0} tarefas encontradas para ${brDateStr}`);

  let taskList = '';

  if (tasks && tasks.length > 0) {
    // Agrupar por responsável
    const grouped: Record<string, any[]> = {};
    for (const t of tasks) {
      const nome = t.responsavel?.name || 'Sem responsável';
      if (!grouped[nome]) grouped[nome] = [];
      grouped[nome].push(t);
    }

    // Ordenar responsáveis por quem tem mais tarefas (desc)
    const sortedEntries = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

    const sections: string[] = [];
    for (const [responsavel, memberTasks] of sortedEntries) {
      // Contar tipos
      const meetings = memberTasks.filter((t: any) => t.task_type === 'meeting').length;
      const calls = memberTasks.filter((t: any) => t.task_type === 'call').length;
      const followUps = memberTasks.filter((t: any) => t.task_type === 'follow_up').length;
      const others = memberTasks.length - meetings - calls - followUps;

      // Resumo de tipos
      const typeParts: string[] = [];
      if (meetings > 0) typeParts.push(`${meetings} reunião${meetings > 1 ? 'ões' : ''}`);
      if (calls > 0) typeParts.push(`${calls} ligação${calls > 1 ? 'ões' : ''}`);
      if (followUps > 0) typeParts.push(`${followUps} follow-up${followUps > 1 ? 's' : ''}`);
      if (others > 0) typeParts.push(`${others} outra${others > 1 ? 's' : ''}`);
      const typesSummary = typeParts.length > 0 ? ` (${typeParts.join(', ')})` : '';

      // Header do responsável
      let section = `👤 *${responsavel}* — ${memberTasks.length} tarefa${memberTasks.length > 1 ? 's' : ''}${typesSummary}\n`;

      // Tarefas ordenadas por horário
      const lines = memberTasks.map((t: any) => {
        const time = new Date(t.scheduled_at).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo'
        });
        const clientName = t.lead?.name || t.organization?.name || '';
        const taskName = t.name || t.task_type || 'Tarefa';
        const emoji = taskTypeEmojis[t.task_type] || '📋';
        const confirmed = t.confirmed_by_client ? ' ✅' : '';

        if (clientName) {
          return `  ${emoji} ${time} — *${clientName}* - ${taskName}${confirmed}`;
        }
        return `  ${emoji} ${time} — ${taskName}${confirmed}`;
      });

      section += lines.join('\n');
      sections.push(section);
    }

    taskList = sections.join('\n\n');
  } else {
    taskList = '✨ Nenhuma tarefa agendada para hoje';
  }

  // Substituir variáveis no template
  const brDateFormatted = brNow.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const message = rule.message_template
    .replace(/\{\{lista_tarefas\}\}/g, taskList)
    .replace(/\{\{data\}\}/g, brDateFormatted)
    .replace(/\{\{total_tarefas\}\}/g, String(tasks?.length || 0));

  const success = await sendNotification(supabase, rule, null, message);
  return success ? 1 : 0;
}

// ========== FORMAT MESSAGE (for event-based rules) ==========
function formatMessage(template: string, task: Task, useDueDateTime: boolean): string {
  const dateStr = useDueDateTime ? task.due_datetime : task.scheduled_at;
  const scheduledDate = dateStr ? new Date(dateStr) : new Date();

  const clientName = task.lead?.name || task.organization?.name || 'Cliente';
  const responsavelName = task.responsavel?.name || '';
  const taskName = task.name || task.title || 'Tarefa';
  const taskLabel = taskTypeLabels[task.task_type || ''] || task.task_type || '';
  const priorityLabel = priorityLabels[task.priority || ''] || task.priority || '';
  const notes = task.notes || '';

  return template
    .replace(/\{\{tarefa\}\}/g, taskName)
    .replace(/\{\{lista_tarefas\}\}/g, taskName)
    .replace(/\{\{tipo\}\}/g, taskLabel)
    .replace(/\{\{prioridade\}\}/g, priorityLabel)
    .replace(/\{\{notas\}\}/g, notes)
    .replace(/\{\{cliente\}\}/g, clientName)
    .replace(/\{\{data\}\}/g, scheduledDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }))
    .replace(/\{\{hora\}\}/g, scheduledDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo'
    }))
    .replace(/\{\{link_meet\}\}/g, task.meeting_link || 'Link não disponível')
    .replace(/\{\{responsavel\}\}/g, responsavelName)
    .replace(/\{\{contato_nome\}\}/g, task.organization?.primary_contact?.name || task.lead?.name || '')
    .replace(/\{\{contato_telefone\}\}/g, task.organization?.primary_contact?.phone || task.lead?.phone || '');
}

// ========== SEND NOTIFICATION ==========
async function sendNotification(supabase: any, rule: NotificationRule, task: Task | null, message: string): Promise<boolean> {
  console.log(`📤 Enviando notificação: ${rule.name}`);
  console.log(`📝 Mensagem (${message.length} chars): ${message.substring(0, 150)}...`);

  let targetNumber = '';

  if (rule.action_channel === 'whatsapp_group') {
    targetNumber = rule.action_target_id || '';
  } else if (rule.action_channel === 'whatsapp_client') {
    if (task?.lead?.phone) {
      targetNumber = task.lead.phone;
    } else if (task?.organization?.primary_contact?.phone) {
      targetNumber = task.organization.primary_contact.phone;
    }
  } else if (rule.action_channel === 'whatsapp_user') {
    if (task?.responsavel?.phone) {
      targetNumber = task.responsavel.phone;
    }
  }

  if (!targetNumber) {
    const errorMsg = `Telefone/grupo não configurado para canal ${rule.action_channel}`;
    console.log(`⚠️ ${errorMsg}`);
    await logNotification(supabase, rule, task?.id || null, 'failed', errorMsg);
    return false;
  }

  // Formatar número
  let formattedNumber = targetNumber.replace(/\D/g, '');
  if (!formattedNumber.startsWith('55') && formattedNumber.length <= 11) {
    formattedNumber = '55' + formattedNumber;
  }
  if (targetNumber.includes('@g.us')) {
    formattedNumber = targetNumber;
  }

  // Buscar instância WhatsApp
  let instanceQuery = supabase
    .from('whatsapp_instances')
    .select('id, name, api_key, api_url')
    .eq('status', 'connected');

  if (rule.action_instance_id) {
    instanceQuery = instanceQuery.eq('id', rule.action_instance_id);
  }

  const { data: instance, error: instanceError } = await instanceQuery.limit(1).single();

  if (instanceError || !instance?.api_key || !instance?.api_url) {
    const errorMsg = instanceError ? serializeError(instanceError) : 'Nenhuma instância WhatsApp conectada';
    console.log(`⚠️ ${errorMsg}`);
    await logNotification(supabase, rule, task?.id || null, 'failed', errorMsg);
    return false;
  }

  console.log(`📲 Instância: ${instance.name} → ${formattedNumber}`);

  try {
    const apiUrl = `${instance.api_url}/send/text`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'token': instance.api_key,
      },
      body: JSON.stringify({
        number: formattedNumber,
        text: message,
      }),
    });

    const responseText = await response.text();
    let result: any;
    try { result = JSON.parse(responseText); } catch { result = { raw: responseText }; }

    if (response.ok) {
      console.log('✅ Mensagem enviada com sucesso');
      await logNotification(supabase, rule, task?.id || null, 'sent', null, message, formattedNumber);
      return true;
    } else {
      const errorMsg = `API retornou ${response.status}: ${JSON.stringify(result)}`;
      console.error(`❌ Erro ao enviar:`, errorMsg);
      await logNotification(supabase, rule, task?.id || null, 'failed', errorMsg);
      return false;
    }
  } catch (error) {
    const errorMsg = serializeError(error);
    console.error('❌ Erro ao enviar notificação:', errorMsg);
    await logNotification(supabase, rule, task?.id || null, 'failed', errorMsg);
    return false;
  }
}

// ========== DEDUP CHECKS ==========
async function checkAlreadySent(supabase: any, ruleId: string, eventId: string): Promise<boolean> {
  const { data } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('rule_id', ruleId)
    .eq('event_id', eventId)
    .eq('status', 'sent')
    .limit(1);

  return data && data.length > 0;
}

async function checkAlreadySentToday(supabase: any, ruleId: string, now: Date): Promise<boolean> {
  // Checar se já enviou hoje em Brasília
  const brNow = toBrasilia(now);
  const brDateStr = brNow.toISOString().split('T')[0];
  const todayStartUTC = `${brDateStr}T03:00:00.000Z`;

  const { data } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('rule_id', ruleId)
    .eq('status', 'sent')
    .gte('created_at', todayStartUTC)
    .limit(1);

  return data && data.length > 0;
}

// ========== LOG ==========
async function logNotification(
  supabase: any,
  rule: NotificationRule,
  eventId: string | null,
  status: string,
  errorMessage: string | null,
  message?: string,
  target?: string
) {
  try {
    await supabase.from('notification_logs').insert({
      rule_id: rule.id,
      rule_name: rule.name,
      event_id: eventId,
      event_type: rule.trigger_event,
      channel: rule.action_channel,
      target: target || null,
      message: message || null,
      status,
      error_message: errorMessage,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (logError) {
    console.error('❌ Erro ao logar notificação:', serializeError(logError));
  }
}
