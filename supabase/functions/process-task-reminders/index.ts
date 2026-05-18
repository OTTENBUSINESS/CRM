import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ID da instância CAROL
const CAROL_INSTANCE_ID = "e6f5adfa-6fb7-42b6-b837-fe33e8069877";

interface Task {
  id: string;
  name: string;
  task_type: string;
  scheduled_at: string;
  meeting_link: string | null;
  responsavel_id: string | null;
  lead_id: string | null;
  organization_id: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  phone: string | null;
}

interface WhatsAppInstance {
  id: string;
  name: string;
  api_key: string;
  api_url: string;
}

/**
 * Formata número de telefone para envio via UAZAPI
 */
function formatPhone(phone: string): string {
  // Remove caracteres não numéricos
  let cleaned = phone.replace(/\D/g, "");

  // Se começar com 55, mantém. Se não, adiciona.
  if (!cleaned.startsWith("55")) {
    cleaned = "55" + cleaned;
  }

  return cleaned;
}

/**
 * Formata data/hora para exibição
 */
function formatDateTime(dateString: string): { date: string; time: string } {
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    time: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }),
  };
}

/**
 * Envia mensagem WhatsApp via UAZAPI
 */
async function sendWhatsApp(instance: WhatsAppInstance, phone: string, message: string): Promise<boolean> {
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
        number: formatPhone(phone),
        text: message,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`✅ WhatsApp enviado para ${phone}`);
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
 * Gera mensagem de lembrete
 */
function generateReminderMessage(task: Task, leadName?: string, orgName?: string): string {
  const { date, time } = formatDateTime(task.scheduled_at);

  const taskTypeLabels: Record<string, string> = {
    call: "Ligação",
    meeting: "Reunião",
    onboarding: "Onboarding",
    follow_up: "Follow-up",
    checkin: "Check-in",
    whatsapp: "WhatsApp",
    email: "Email",
  };

  const taskLabel = taskTypeLabels[task.task_type] || "Tarefa";
  const clientInfo = leadName || orgName || "";

  let message = `⏰ *LEMBRETE - 5 MINUTOS*\n\n`;
  message += `📋 *${taskLabel}:* ${task.name}\n`;

  if (clientInfo) {
    message += `👤 *Cliente:* ${clientInfo}\n`;
  }

  message += `🕐 *Horário:* ${time}\n`;

  if (task.meeting_link) {
    message += `\n🔗 *Link da reunião:*\n${task.meeting_link}\n`;
  }

  message += `\n_Não se atrase!_ 🚀`;

  return message;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("🔔 Processando lembretes de tarefas...");

    // Buscar instância CAROL
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("id, name, api_key, api_url")
      .eq("id", CAROL_INSTANCE_ID)
      .eq("status", "connected")
      .single();

    if (instanceError || !instance) {
      console.error("❌ Instância CAROL não encontrada ou desconectada");
      return new Response(
        JSON.stringify({ error: "Instância WhatsApp não disponível" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Calcular janela de tempo: agora + 5 minutos (+/- 1 minuto de tolerância)
    const now = new Date();
    const minTime = new Date(now.getTime() + 4 * 60 * 1000); // 4 minutos
    const maxTime = new Date(now.getTime() + 6 * 60 * 1000); // 6 minutos

    console.log(`📅 Buscando tarefas entre ${minTime.toISOString()} e ${maxTime.toISOString()}`);

    // Buscar tarefas que:
    // 1. Não estão concluídas
    // 2. Têm scheduled_at nos próximos 5 minutos
    // 3. Ainda não receberam lembrete
    // 4. Têm responsável definido
    const { data: tasks, error: tasksError } = await supabase
      .from("company_activities")
      .select(`
        id,
        name,
        task_type,
        scheduled_at,
        meeting_link,
        responsavel_id,
        participants,
        lead_id,
        organization_id,
        lead:leads!company_activities_lead_id_fkey(name),
        organization:organizations!company_activities_organization_id_fkey(name)
      `)
      .eq("completed", false)
      .is("reminder_sent_at", null)
      .not("responsavel_id", "is", null)
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", minTime.toISOString())
      .lte("scheduled_at", maxTime.toISOString());

    if (tasksError) {
      console.error("❌ Erro ao buscar tarefas:", tasksError);
      return new Response(
        JSON.stringify({ error: tasksError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    console.log(`📋 Encontradas ${tasks?.length || 0} tarefas para notificar`);

    const results = {
      processed: 0,
      sent: 0,
      errors: [] as string[],
    };

    for (const task of tasks || []) {
      results.processed++;

      // Buscar dados do responsável (agora de team_members)
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("id, name, phone")
        .eq("id", task.responsavel_id)
        .single();

      if (!teamMember?.phone) {
        console.log(`⚠️ Responsável ${task.responsavel_id} sem telefone cadastrado`);
        results.errors.push(`Tarefa ${task.id}: responsável sem telefone`);
        continue;
      }

      // Gerar e enviar mensagem
      const leadName = (task as any).lead?.name;
      const orgName = (task as any).organization?.name;
      const message = generateReminderMessage(task, leadName, orgName);

      const sent = await sendWhatsApp(instance, teamMember.phone, message);

      if (sent) {
        results.sent++;

        // Also notify other participants (e.g. SDR who created the task)
        const participants = (task as any).participants as string[] | null;
        if (participants && participants.length > 0) {
          const otherParticipants = participants.filter((id: string) => id !== task.responsavel_id);
          for (const participantId of otherParticipants) {
            const { data: participant } = await supabase
              .from("team_members")
              .select("id, name, phone")
              .eq("id", participantId)
              .single();

            if (participant?.phone) {
              await sendWhatsApp(instance, participant.phone, message);
            }
          }
        }

        // Marcar como notificada
        const { error: updateError } = await supabase
          .from("company_activities")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", task.id);

        if (updateError) {
          console.error(`❌ Erro ao marcar tarefa ${task.id} como notificada:`, updateError);
        }
      } else {
        results.errors.push(`Tarefa ${task.id}: falha ao enviar WhatsApp`);
      }
    }

    // ═══════════════════════════════════════════════════
    // CRITICAL TASKS — WhatsApp reminder every 2 hours
    // ═══════════════════════════════════════════════════
    console.log("🚨 Verificando tarefas cruciais pendentes...");

    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    const { data: criticalTasks, error: criticalError } = await supabase
      .from("company_activities")
      .select(`
        id,
        name,
        task_type,
        scheduled_at,
        meeting_link,
        responsavel_id,
        lead_id,
        organization_id,
        critical_last_reminded_at,
        lead:leads!company_activities_lead_id_fkey(name),
        organization:organizations!company_activities_organization_id_fkey(name)
      `)
      .eq("completed", false)
      .eq("is_critical", true)
      .not("responsavel_id", "is", null)
      .lte("scheduled_at", now.toISOString());

    if (criticalError) {
      console.error("❌ Erro ao buscar tarefas cruciais:", criticalError);
    }

    const criticalResults = { processed: 0, sent: 0 };

    for (const task of criticalTasks || []) {
      // Only send if never reminded OR last reminder was >2h ago
      if (task.critical_last_reminded_at && task.critical_last_reminded_at > twoHoursAgo) {
        continue;
      }

      criticalResults.processed++;

      const { data: member } = await supabase
        .from("team_members")
        .select("id, name, phone")
        .eq("id", task.responsavel_id)
        .single();

      if (!member?.phone) continue;

      const { time } = formatDateTime(task.scheduled_at);
      const leadName = (task as any).lead?.name;
      const orgName = (task as any).organization?.name;
      const clientInfo = leadName || orgName || "";

      let message = `🚨 *TAREFA CRUCIAL PENDENTE*\n\n`;
      message += `📋 *${task.name}*\n`;
      if (clientInfo) message += `👤 ${clientInfo}\n`;
      message += `⏰ Era para ${time}\n\n`;
      message += `_Essa tarefa é CRUCIAL e precisa ser feita HOJE. Não deixe passar!_`;

      const sent = await sendWhatsApp(instance, member.phone, message);

      if (sent) {
        criticalResults.sent++;
        await supabase
          .from("company_activities")
          .update({ critical_last_reminded_at: now.toISOString() })
          .eq("id", task.id);
      }
    }

    console.log(`🚨 Cruciais processadas:`, criticalResults);
    console.log(`✅ Processamento concluído:`, results);

    return new Response(
      JSON.stringify({ success: true, ...results, critical: criticalResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("❌ Erro no processamento:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
