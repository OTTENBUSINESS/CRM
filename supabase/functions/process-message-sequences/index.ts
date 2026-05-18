// ============================================================================
// process-message-sequences
// Worker periódico (cron 1min) que avança enrollments em sequências/cadências:
//   1. Busca enrollments ativos com next_run_at <= now
//   2. Pega o próximo step da sequência
//   3. Cria um wa_scheduled_messages (com scheduled_for = now)
//   4. Atualiza enrollment: current_step++ e next_run_at = now + delay do próximo step
//   5. Se não houver mais steps → marca enrollment como completed
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BATCH_SIZE = 50;

function addDelay(base: Date, value: number, unit: string): Date {
  const d = new Date(base);
  switch (unit) {
    case "minutes": d.setMinutes(d.getMinutes() + value); break;
    case "hours":   d.setHours(d.getHours() + value); break;
    case "days":    d.setDate(d.getDate() + value); break;
  }
  return d;
}

interface Enrollment {
  id: string;
  sequence_id: string;
  member_phone: string | null;
  member_jid: string | null;
  current_step: number;
}

interface Sequence {
  id: string;
  community_id: string;
  is_active: boolean;
  community: { instance_id: string };
}

interface Step {
  id: string;
  step_order: number;
  delay_value: number;
  delay_unit: string;
  target_group_id: string | null;
  message_type: string;
  content: string | null;
  media_url: string | null;
  target_group: { group_jid: string | null } | null;
}

async function processEnrollment(enrollment: Enrollment): Promise<{ ok: boolean; error?: string }> {
  // Buscar sequência + verificar se está ativa
  const { data: sequence, error: seqErr } = await supabase
    .from("wa_message_sequences")
    .select("id, community_id, is_active, community:wa_communities(instance_id)")
    .eq("id", enrollment.sequence_id)
    .single<Sequence>();

  if (seqErr || !sequence) {
    await supabase
      .from("wa_sequence_enrollments")
      .update({ status: "failed", metadata: { error: "sequence not found" } })
      .eq("id", enrollment.id);
    return { ok: false, error: "sequence not found" };
  }

  if (!sequence.is_active) {
    return { ok: true }; // skip — pause silenciosa
  }

  const nextStepOrder = enrollment.current_step + 1;

  // Buscar step atual a executar
  const { data: step } = await supabase
    .from("wa_sequence_steps")
    .select(
      "id, step_order, delay_value, delay_unit, target_group_id, message_type, content, media_url, target_group:wa_community_groups(group_jid)",
    )
    .eq("sequence_id", enrollment.sequence_id)
    .eq("step_order", nextStepOrder)
    .maybeSingle<Step>();

  if (!step) {
    // Sequência terminou
    await supabase
      .from("wa_sequence_enrollments")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", enrollment.id);
    return { ok: true };
  }

  // Determinar destino: se step tem target_group, envia pro grupo; senão pro phone do membro
  const target_jid =
    step.target_group?.group_jid || enrollment.member_jid || enrollment.member_phone;

  if (!target_jid) {
    await supabase
      .from("wa_sequence_enrollments")
      .update({ status: "failed", metadata: { error: "no target_jid" } })
      .eq("id", enrollment.id);
    return { ok: false, error: "no target_jid" };
  }

  // Criar mensagem agendada (imediata)
  const { error: insertErr } = await supabase.from("wa_scheduled_messages").insert({
    instance_id: sequence.community.instance_id,
    community_id: sequence.community_id,
    target_group_id: step.target_group_id,
    target_jid,
    message_type: step.message_type,
    content: step.content,
    media_url: step.media_url,
    scheduled_for: new Date().toISOString(),
    status: "pending",
    sequence_id: sequence.id,
    sequence_step_id: step.id,
    enrollment_id: enrollment.id,
  });

  if (insertErr) {
    return { ok: false, error: insertErr.message };
  }

  // Calcular next_run_at do PRÓXIMO step
  const { data: nextStep } = await supabase
    .from("wa_sequence_steps")
    .select("delay_value, delay_unit")
    .eq("sequence_id", enrollment.sequence_id)
    .eq("step_order", nextStepOrder + 1)
    .maybeSingle();

  const next_run_at = nextStep
    ? addDelay(new Date(), nextStep.delay_value, nextStep.delay_unit).toISOString()
    : null;

  await supabase
    .from("wa_sequence_enrollments")
    .update({
      current_step: nextStepOrder,
      next_run_at,
      status: nextStep ? "active" : "active", // marca completed só na próxima rodada
    })
    .eq("id", enrollment.id);

  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const now = new Date().toISOString();
    const { data: due, error } = await supabase
      .from("wa_sequence_enrollments")
      .select("id, sequence_id, member_phone, member_jid, current_step")
      .eq("status", "active")
      .not("next_run_at", "is", null)
      .lte("next_run_at", now)
      .limit(BATCH_SIZE);

    if (error) throw error;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.all(due.map((e) => processEnrollment(e as Enrollment)));
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;

    return new Response(
      JSON.stringify({ processed: results.length, ok, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[process-message-sequences] erro:", err);
    return new Response(
      JSON.stringify({ error: String(err instanceof Error ? err.message : err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
