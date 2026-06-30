import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isAuthorizedCaller, unauthorizedResponse } from "../_shared/requireCaller.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Templates de follow-up (sem IA — custo zero de tokens)
const FOLLOWUP_TEMPLATES = [
  // Attempt 1 (48h após no-show)
  `Oi {nome}! Tudo bem? 😊\nVi que não conseguimos nos conectar na nossa reunião.\nSem problemas! Quer remarcar pra outro horário essa semana?\nTenho disponibilidade {dia1} e {dia2}. Qual funciona melhor pra você?`,
  // Attempt 2 (96h após no-show)
  `E aí {nome}, tudo certo?\nQueria ver se conseguimos achar um horário que funcione melhor pra gente conversar.\nMe fala o melhor dia e horário pra você que eu encaixo! 🤝`,
  // Attempt 3 (144h / 6 dias após no-show)
  `{nome}, passando aqui rapidinho!\nSei que a agenda fica apertada... se ainda fizer sentido conversar sobre {produto}, é só me responder aqui que agendo na hora.\nSe não for mais o momento, sem problema nenhum! 👍`,
];

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 20;
const MIN_DELAY_MS = 8000;
const MAX_DELAY_MS = 15000;

function formatPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (!cleaned.startsWith("55") && cleaned.length <= 11) {
    cleaned = "55" + cleaned;
  }
  return cleaned;
}

function getNextBusinessDays(): { dia1: string; dia2: string } {
  const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const now = new Date();
  const result: string[] = [];

  for (let i = 1; i <= 7 && result.length < 2; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      result.push(days[dow]);
    }
  }

  return { dia1: result[0] || "Terça", dia2: result[1] || "Quinta" };
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let msg = template;
  for (const [key, value] of Object.entries(vars)) {
    msg = msg.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return msg;
}

function randomDelay(): Promise<void> {
  const ms = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method !== "OPTIONS" && !isAuthorizedCaller(req)) return unauthorizedResponse();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Buscar leads elegíveis para follow-up (máx BATCH_SIZE)
    const { data: eligibleLeads, error: leadsError } = await supabase.rpc(
      "get_noshow_followup_eligible_leads",
      { batch_limit: BATCH_SIZE }
    );

    // Fallback: query direta se RPC não existir
    let leads = eligibleLeads;
    if (leadsError) {
      console.log("[NoShow] RPC não disponível, usando query direta:", leadsError.message);

      // Buscar leads em no-show com telefone válido
      const { data: noshowLeads } = await supabase
        .from("leads")
        .select("id, name, phone, etapa_funil")
        .eq("etapa_funil", "no_show")
        .not("phone", "is", null)
        .limit(BATCH_SIZE);

      if (!noshowLeads || noshowLeads.length === 0) {
        return new Response(JSON.stringify({ message: "Nenhum lead elegível", processed: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Filtrar: ter histórico de WhatsApp, < 3 tentativas, sem follow-up nas últimas 48h, sem resposta recente
      const filteredLeads: typeof noshowLeads = [];

      for (const lead of noshowLeads) {
        // Checar se tem histórico de WhatsApp (confirma número válido)
        const { count: whatsappCount } = await supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id)
          .limit(1);
        if (!whatsappCount || whatsappCount === 0) continue;

        // Contar tentativas existentes
        const { count: attemptCount } = await supabase
          .from("noshow_followups")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id);
        if (attemptCount && attemptCount >= MAX_ATTEMPTS) continue;

        // Checar se já teve follow-up nas últimas 48h
        const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: recentFollowup } = await supabase
          .from("noshow_followups")
          .select("id")
          .eq("lead_id", lead.id)
          .gte("sent_at", cutoff48h)
          .limit(1)
          .maybeSingle();
        if (recentFollowup) continue;

        // Checar se lead respondeu desde o último follow-up
        const { data: lastFollowup } = await supabase
          .from("noshow_followups")
          .select("sent_at")
          .eq("lead_id", lead.id)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastFollowup) {
          const { count: replyCount } = await supabase
            .from("whatsapp_messages")
            .select("id", { count: "exact", head: true })
            .eq("lead_id", lead.id)
            .eq("from_me", false)
            .gte("sent_at", lastFollowup.sent_at)
            .limit(1);
          if (replyCount && replyCount > 0) continue;
        }

        filteredLeads.push(lead);
        if (filteredLeads.length >= BATCH_SIZE) break;
      }

      leads = filteredLeads;
    }

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhum lead elegível", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[NoShow] ${leads.length} leads elegíveis para follow-up`);

    // 2. Buscar instância WhatsApp ativa
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("id, name, api_key, api_url")
      .eq("status", "connected")
      .limit(1)
      .single();

    if (!instance) {
      console.error("[NoShow] ❌ Nenhuma instância WhatsApp conectada");
      return new Response(JSON.stringify({ error: "Nenhuma instância WhatsApp conectada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { dia1, dia2 } = getNextBusinessDays();
    let processed = 0;
    let errors = 0;

    // 3. Processar cada lead
    for (const lead of leads) {
      try {
        // Contar tentativas anteriores
        const { count: prevAttempts } = await supabase
          .from("noshow_followups")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id);

        const attemptNumber = (prevAttempts || 0) + 1;

        if (attemptNumber > MAX_ATTEMPTS) {
          console.log(`[NoShow] Lead ${lead.name} já atingiu ${MAX_ATTEMPTS} tentativas, pulando`);
          continue;
        }

        // Buscar deal ativo para preencher {produto}
        const { data: deal } = await supabase
          .from("deals")
          .select("id, title, product:products(name)")
          .eq("lead_id", lead.id)
          .in("status", ["negotiation", "proposal_sent"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const productName = deal?.product?.name || deal?.title || "nosso serviço";
        const firstName = (lead.name || "").split(" ")[0] || "Olá";

        // Selecionar e preencher template
        const template = FOLLOWUP_TEMPLATES[attemptNumber - 1] || FOLLOWUP_TEMPLATES[2];
        const message = fillTemplate(template, {
          nome: firstName,
          produto: productName,
          dia1,
          dia2,
        });

        // Enviar via UAZAPI
        const phone = formatPhone(lead.phone);
        const apiUrl = `${instance.api_url}/send/text`;

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            token: instance.api_key,
          },
          body: JSON.stringify({ number: phone, text: message }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error(`[NoShow] ❌ Falha ao enviar para ${lead.name}:`, result);
          errors++;
          continue;
        }

        console.log(`[NoShow] ✅ Follow-up #${attemptNumber} enviado para ${lead.name}`);

        // Registrar follow-up
        await supabase.from("noshow_followups").insert({
          lead_id: lead.id,
          deal_id: deal?.id || null,
          attempt_number: attemptNumber,
          message_sent: message,
          status: "sent",
        });

        // Registrar mensagem no WhatsApp (aparece no inbox)
        await supabase.from("whatsapp_messages").insert({
          lead_id: lead.id,
          content: message,
          from_me: true,
          sent_at: new Date().toISOString(),
          message_type: "text",
          status: "sent",
          sender_name: "Automação No-show",
          sender_phone: phone,
          instance_id: instance.id,
        });

        // Se atingiu máximo de tentativas, criar alerta e parar
        if (attemptNumber >= MAX_ATTEMPTS) {
          await supabase.from("noshow_followups")
            .update({ status: "stopped" })
            .eq("lead_id", lead.id)
            .eq("attempt_number", attemptNumber);

          await supabase.from("sales_alerts").insert({
            lead_id: lead.id,
            type: "no_show_max_attempts",
            title: `${lead.name} - 3 tentativas de resgate sem resposta`,
            description: `Lead ${lead.name} não respondeu a nenhuma das 3 tentativas de follow-up após no-show. Ação manual necessária.`,
            priority: "medium",
            status: "active",
          });

          console.log(`[NoShow] ⚠️ Lead ${lead.name} atingiu ${MAX_ATTEMPTS} tentativas — alerta criado`);
        }

        processed++;

        // Delay humanizado entre envios (8-15s)
        if (processed < leads.length) {
          await randomDelay();
        }
      } catch (err) {
        console.error(`[NoShow] ❌ Erro processando lead ${lead.id}:`, err);
        errors++;
      }
    }

    const summary = {
      message: `Follow-up concluído`,
      processed,
      errors,
      total_eligible: leads.length,
    };

    console.log("[NoShow] 📊 Resumo:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[NoShow] ❌ Erro geral:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
