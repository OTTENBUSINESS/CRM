import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isAuthorizedCaller, unauthorizedResponse } from "../_shared/requireCaller.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ID da instância CAROL
const CAROL_INSTANCE_ID = "e6f5adfa-6fb7-42b6-b837-fe33e8069877";

// Estágio "Call Agendada" no pipeline
const CALL_AGENDADA_STAGE_ID = "11111111-0001-0001-0001-000000000004";

interface WhatsAppInstance {
  id: string;
  name: string;
  api_key: string;
  api_url: string;
}

function formatPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (!cleaned.startsWith("55")) {
    cleaned = "55" + cleaned;
  }
  return cleaned;
}

async function sendWhatsApp(
  instance: WhatsAppInstance,
  phone: string,
  message: string
): Promise<boolean> {
  try {
    const response = await fetch(`${instance.api_url}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        token: instance.api_key,
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

Deno.serve(async (req: Request) => {
  if (req.method !== "OPTIONS" && !isAuthorizedCaller(req)) return unauthorizedResponse();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("🔔 Verificando meetings/calls pendentes...");

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
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // Buscar meetings/calls pendentes:
    // - task_type é call ou meeting
    // - scheduled_at passou há mais de 1 hora (mas no máximo 48h atrás — não cobrar reuniões antigas)
    // - não completada/cancelada/no_show
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const maxAge = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: pendingTasks, error: tasksError } = await supabase
      .from("company_activities")
      .select(
        `
        id,
        name,
        task_type,
        scheduled_at,
        responsavel_id,
        lead_id,
        metadata,
        lead:leads!company_activities_lead_id_fkey(name)
      `
      )
      .in("task_type", ["call", "meeting"])
      .eq("completed", false)
      .not("status", "in", '("completed","no_show","cancelled")')
      .not("responsavel_id", "is", null)
      .not("scheduled_at", "is", null)
      .lt("scheduled_at", oneHourAgo)
      .gt("scheduled_at", maxAge)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (tasksError) {
      console.error("❌ Erro ao buscar tasks:", tasksError);
      return new Response(
        JSON.stringify({ error: tasksError.message }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    console.log(
      `📋 Encontradas ${pendingTasks?.length || 0} meetings/calls pendentes`
    );

    const results = {
      processed: 0,
      notified: 0,
      skipped: 0,
      errors: [] as string[],
    };

    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

    for (const task of pendingTasks || []) {
      results.processed++;

      // Verificar se já foi notificado nas últimas 6h
      const lastNotified = task.metadata?.pending_meeting_notified_at;
      if (lastNotified) {
        const lastNotifiedTime = new Date(lastNotified).getTime();
        if (Date.now() - lastNotifiedTime < SIX_HOURS_MS) {
          console.log(
            `⏭️ Task ${task.id} já notificada há menos de 6h — pulando`
          );
          results.skipped++;
          continue;
        }
      }

      // Buscar closer (responsável)
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("id, name, phone")
        .eq("id", task.responsavel_id)
        .single();

      if (!teamMember?.phone) {
        console.log(
          `⚠️ Responsável ${task.responsavel_id} sem telefone — pulando`
        );
        results.errors.push(`Task ${task.id}: responsável sem telefone`);
        continue;
      }

      // Montar mensagem — usar nome do lead, ou extrair do nome da task
      let leadName = (task as any).lead?.name;
      if (!leadName && task.name) {
        // Extrair nome da task: "Reunião IA | João + Fábio" → "João + Fábio"
        // "IA na Prática & Marcelo" → "Marcelo"
        // "ANDRESSA & IAP" → "ANDRESSA"
        const separators = [' | ', ' & ', ' + ', ' - '];
        for (const sep of separators) {
          if (task.name.includes(sep)) {
            const parts = task.name.split(sep);
            // Pegar a parte que NÃO é "IA na Prática" / "IAP" / "Reunião IA"
            const candidate = parts.find((p: string) =>
              !p.trim().toLowerCase().includes('ia na prática') &&
              !p.trim().toLowerCase().includes('iap') &&
              !p.trim().toLowerCase().includes('reunião ia') &&
              !p.trim().toLowerCase().startsWith('ligar')
            )?.trim();
            if (candidate) { leadName = candidate; break; }
          }
        }
      }
      if (!leadName) leadName = task.name || "lead";

      const scheduledTime = new Date(task.scheduled_at!).toLocaleTimeString(
        "pt-BR",
        {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        }
      );

      const taskLabel = task.task_type === "call" ? "call" : "reunião";
      const message =
        `⚠️ *ATENÇÃO ${teamMember.name}!*\n\n` +
        `A ${taskLabel} com *${leadName}* das *${scheduledTime}* está sem status no CRM.\n\n` +
        `Você está travando o fluxo do pipeline! Resolve agora:\n` +
        `• *Realizada* — se a call rolou\n` +
        `• *No-show* — se o lead não apareceu\n` +
        `• *Reagendar* — se mudou a data\n\n` +
        `_Não deixa isso acumular_ 🚨`;

      const sent = await sendWhatsApp(instance, teamMember.phone, message);

      if (sent) {
        results.notified++;

        // Marcar pending_meeting_notified_at no metadata
        const updatedMetadata = {
          ...(task.metadata || {}),
          pending_meeting_notified_at: new Date().toISOString(),
        };

        await supabase
          .from("company_activities")
          .update({ metadata: updatedMetadata })
          .eq("id", task.id);
      } else {
        results.errors.push(`Task ${task.id}: falha ao enviar WhatsApp`);
      }
    }

    // --- Fix D: Alerta de anomalia ---
    // Buscar leads com meeting futura mas que NÃO estão em "Call Agendada"
    const now = new Date().toISOString();

    const { data: futureTasks } = await supabase
      .from("company_activities")
      .select(
        `
        id,
        lead_id,
        scheduled_at,
        lead:leads!company_activities_lead_id_fkey(name, pipeline_stage_id)
      `
      )
      .in("task_type", ["call", "meeting"])
      .eq("completed", false)
      .not("status", "in", '("completed","no_show","cancelled")')
      .gt("scheduled_at", now)
      .not("lead_id", "is", null)
      .limit(50);

    let anomalies = 0;
    for (const ft of futureTasks || []) {
      const lead = (ft as any).lead;
      if (lead && lead.pipeline_stage_id !== CALL_AGENDADA_STAGE_ID) {
        // Buscar nome do estágio atual
        const { data: stage } = await supabase
          .from("sales_pipeline_stages")
          .select("name")
          .eq("id", lead.pipeline_stage_id)
          .single();

        console.warn(
          `⚠️ Anomalia: lead "${lead.name}" tem call futura (${ft.scheduled_at}) mas está em "${stage?.name || lead.pipeline_stage_id}"`
        );
        anomalies++;
      }
    }

    console.log(`✅ Processamento concluído:`, { ...results, anomalies });

    return new Response(
      JSON.stringify({ success: true, ...results, anomalies }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("❌ Erro no processamento:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
