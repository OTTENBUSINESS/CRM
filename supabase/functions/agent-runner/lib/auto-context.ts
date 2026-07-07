/**
 * auto-context — blocos automáticos injetados no system prompt do agente.
 *
 * O LLM precisa de informações estruturadas que NÃO devem ser hardcoded no
 * system_prompt (mudam com frequência ou são por agente):
 *  - closer_pool: lista de team_members do pool com nomes + UUIDs (pra tools)
 *  - icp_criteria: critério ICP (texto livre, já em settings — só formatamos)
 *  - working_hours / working_days
 *  - lista de pipelines/stages se o agente lida com multi-pipeline (futuro)
 *
 * O LLM precisa saber UUIDs porque as tools `check_availability`,
 * `schedule_meeting`, etc, exigem uuid (não nome).
 */

import { db } from "../_shared/supabase.ts";

interface BuildContextArgs {
  settings: Record<string, unknown> | null | undefined;
  channel?: string;
  context?: Record<string, unknown> | null;   // payload.context (lead_id, deal_id, etc)
  agent_id?: string;                          // pra buscar notas do agente
}

export async function buildAutoContext(args: BuildContextArgs): Promise<string> {
  const blocks: string[] = [];

  // Bloco 1: Pool de closers (com UUIDs)
  const closerBlock = await buildCloserPoolBlock(args.settings);
  if (closerBlock) blocks.push(closerBlock);

  // Bloco 2: ICP (já em texto livre no settings)
  const icpBlock = buildIcpBlock(args.settings);
  if (icpBlock) blocks.push(icpBlock);

  // Bloco 3: Working hours
  const whBlock = buildWorkingHoursBlock(args.settings);
  if (whBlock) blocks.push(whBlock);

  // Bloco 4: Sessão (lead/deal disponíveis OU instrução de modo teste)
  const sessionBlock = await buildSessionContextBlock(args.channel, args.context);
  if (sessionBlock) blocks.push(sessionBlock);

  // Bloco 5: Índice de notas (se agente tem auto_inject_index=true)
  const notesBlock = await buildNotesIndexBlock(args.agent_id, args.settings);
  if (notesBlock) blocks.push(notesBlock);

  if (blocks.length === 0) return "";
  return ["\n---\n[CONTEXTO OPERACIONAL DO AGENTE]\n", ...blocks].join("\n");
}

/**
 * Injeta índice de notas do agente no system prompt (lista título + tags + preview).
 * Configurável via settings.notes.{auto_inject_index, max_index_notes, index_preview_chars}.
 * Default: ON se agente tem skills de notas vinculadas.
 */
async function buildNotesIndexBlock(
  agentId: string | undefined,
  settings: Record<string, unknown> | null | undefined,
): Promise<string> {
  if (!agentId) return "";

  const notesCfg = (settings as { notes?: Record<string, unknown> } | null)?.notes || {};
  const enabled = (notesCfg as any).auto_inject_index !== false;  // default ON
  if (!enabled) return "";

  const maxNotes = (notesCfg as any).max_index_notes ?? 30;
  const previewChars = (notesCfg as any).index_preview_chars ?? 80;
  const ragEnabled = (notesCfg as any).rag_enabled !== false;

  const { db } = await import("../_shared/supabase.ts");
  const { data, error } = await db
    .from("agent_notes")
    .select("title, slug, tags, content, updated_at")
    .eq("agent_id", agentId)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(maxNotes);

  if (error) {
    console.error("[auto-context] notes lookup err:", error.message);
    return "";
  }
  if (!data || data.length === 0) {
    return [
      "## Notas do agente",
      "",
      "Nenhuma nota ainda. Use `salvar_nota(titulo, conteudo)` quando o usuário pedir pra guardar algo.",
    ].join("\n");
  }

  const lines = data.map((n: any) => {
    const preview = (n.content || "").slice(0, previewChars).replace(/\n/g, " ").trim();
    const tags = (n.tags || []).length > 0 ? ` ${n.tags.map((t: string) => "#" + t).join(" ")}` : "";
    return `- "${n.title}"${tags} · "${preview}${preview.length === previewChars ? "..." : ""}"`;
  }).join("\n");

  const rules: string[] = [
    "",
    "**Regras de busca:**",
    "1. Usuário menciona título específico OU está acima no índice → `ler_nota(titulo)`",
    "2. Pergunta por tema/conceito sem mencionar título → `buscar_nota(query)` (busca semântica)",
    "3. Pediu lista/inventário → `listar_notas(tag)` opcional",
    "4. Salvar/atualizar → `salvar_nota(titulo, conteudo, modo)`",
  ];
  if (!ragEnabled) rules.splice(2, 1);  // remove buscar_nota

  return [
    "## Notas do agente",
    "",
    "Use `ler_nota(titulo)` pra puxar conteúdo completo de qualquer uma:",
    "",
    lines,
    ...rules,
  ].join("\n");
}

/**
 * Bloco com lead_id/deal_id quando vier no payload (canal real WhatsApp).
 * Quando NÃO vier (playground/chat_web sem contexto): instrui o LLM a NÃO
 * chamar tools que dependam de uuid de lead — evita LLM inventar string.
 */
async function buildSessionContextBlock(
  channel: string | undefined,
  context: Record<string, unknown> | null | undefined,
): Promise<string> {
  const leadId = typeof context?.lead_id === "string" ? context.lead_id : null;
  const dealId = typeof context?.deal_id === "string" ? context.deal_id : null;
  const isUuid = (s: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  if (!isUuid(leadId)) {
    // Modo simulação — sem lead real. NÃO injeta instrução restritiva no prompt:
    // o executor SQL valida UUIDs e retorna erro amigável se LLM tentar usar tools
    // que dependem de lead_id. Best practice: validar no sistema, não pedir pro LLM.
    return [
      "## Sessão atual",
      "",
      `Canal: ${channel || "chat_web"} (modo de teste — sem lead real conectado)`,
    ].join("\n");
  }

  // Tem lead — busca contexto adicional pra enriquecer
  const { db } = await import("../_shared/supabase.ts");
  const { data: lead } = await db.from("leads")
    .select("id, name, email, company, phone, monthly_revenue_min, monthly_revenue_max, sales_score, lead_temperature")
    .eq("id", leadId!)
    .maybeSingle();

  const lines: string[] = [
    "## Sessão atual",
    "",
    `Canal: ${channel}`,
    `lead_id (UUID): \`${leadId}\``,
  ];
  if (isUuid(dealId)) lines.push(`deal_id (UUID): \`${dealId}\``);

  if (lead) {
    lines.push("", "Dados do lead:");
    if (lead.name) lines.push(`- Nome: ${lead.name}`);
    if (lead.email) lines.push(`- Email: ${lead.email}`);
    if (lead.company) lines.push(`- Empresa: ${lead.company}`);
    if (lead.phone) lines.push(`- Telefone: ${lead.phone}`);
    if (lead.monthly_revenue_min || lead.monthly_revenue_max) {
      lines.push(`- Faturamento mensal estimado: ${lead.monthly_revenue_min || "?"} – ${lead.monthly_revenue_max || "?"} BRL`);
    }
    if (lead.sales_score !== null && lead.sales_score !== undefined) {
      lines.push(`- Score atual: ${lead.sales_score}/100`);
    }
    if (lead.lead_temperature) lines.push(`- Temperatura: ${lead.lead_temperature}`);
  }

  lines.push("", "Use estes UUIDs SEMPRE que chamar tools que pedem `lead_id` ou `deal_id`.");
  return lines.join("\n");
}

async function buildCloserPoolBlock(
  settings: Record<string, unknown> | null | undefined,
): Promise<string> {
  const pool = (settings as { closer_pool?: string[] } | null)?.closer_pool;
  if (!Array.isArray(pool) || pool.length === 0) return "";

  const { data, error } = await db
    .from("team_members")
    .select("id, name, email")
    .in("id", pool);

  if (error || !data || data.length === 0) return "";

  const lines = data
    .map((c: { id: string; name: string; email?: string }) =>
      `- ${c.name} (UUID: ${c.id})${c.email ? ` · ${c.email}` : ""}`
    )
    .join("\n");

  return [
    "## Pool de Closers (vendedores disponíveis)",
    "",
    "Esses são os vendedores no pool deste agente. Use SEMPRE o UUID nas tools",
    "(`check_availability`, `schedule_meeting`), NUNCA o nome:",
    "",
    lines,
    "",
    "Quando o lead aceitar agendar reunião, escolha 1 UUID e passe em `closer_id`.",
    "Para `check_availability`, passe `closer_ids: [\"uuid1\", \"uuid2\"]` com TODOS do pool.",
  ].join("\n");
}

function buildIcpBlock(settings: Record<string, unknown> | null | undefined): string {
  const icp = (settings as { icp_criteria?: string } | null)?.icp_criteria;
  if (!icp || typeof icp !== "string" || icp.trim().length === 0) return "";
  return [
    "## Critério ICP (qualificação)",
    "",
    icp.trim(),
  ].join("\n");
}

function buildWorkingHoursBlock(
  settings: Record<string, unknown> | null | undefined,
): string {
  const s = settings as { working_hours_start?: string; working_hours_end?: string; working_days?: number[] } | null;
  if (!s?.working_hours_start || !s?.working_hours_end) return "";
  const days = Array.isArray(s.working_days) ? s.working_days : [1, 2, 3, 4, 5];
  const dayNames = days
    .map((d) => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"][d] || "?")
    .join(", ");
  return [
    "## Horário de trabalho",
    "",
    `Atendimento: ${s.working_hours_start} às ${s.working_hours_end} (Brasília)`,
    `Dias úteis: ${dayNames}`,
  ].join("\n");
}
