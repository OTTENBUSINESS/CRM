export type TicketDecisionAction = 
  | 'WAIT' 
  | 'CONTINUE' 
  | 'NEW_TICKET' 
  | 'REOPEN' 
  | 'APPEND_KEEP_RESOLVED' 
  | 'RESOLVE';

export interface TicketDecision {
  action: TicketDecisionAction;
  confidence: number;
  subject?: string;
  summary?: string;
  status?: string;
  reason?: string;
  category?: string;
}

interface CallTicketRouterArgs {
  openaiApiKey: string;
  channel: string;
  message: string;
  ticket: any | null;
  recentMessages: any[];
  isGroup: boolean;
}

const OPENAI_TICKET_MODEL = 'gpt-4o-mini';

export async function callTicketRouterLLM(args: CallTicketRouterArgs): Promise<TicketDecision | null> {
  const { isGroup } = args;

  // Preparar mensagens recentes para contexto
  const safeRecent = (args.recentMessages || []).slice(-8).map((m: any) => ({
    role: m.is_from_me ? 'assistant' : 'user',
    content: isGroup ? `[${m.sender_name}] ${m.content}` : m.content,
  }));

  const system = `Você é um assistente de suporte que analisa mensagens de WhatsApp e decide como gerenciar tickets.

REGRAS DE DECISÃO:

1. NÃO crie tickets duplicados para o MESMO assunto
   - Se já existe ticket ativo sobre o mesmo tema = CONTINUE (mesmo assunto)
   - Ticket ativo: "Bot inativo" → Nova msg: "Como adicionar créditos?" = CONTINUE (relacionado ao mesmo problema)
   
2. Entenda o CONTEXTO COMPLETO da conversa antes de decidir
   - Analise as últimas 20 mensagens para entender o fluxo
   - Se cliente mandou "Oi" e depois "Tenho um problema", analise JUNTO
   - Perguntas relacionadas ao MESMO problema = CONTINUE
   - Novo problema/assunto = NEW_TICKET (mesmo com ticket ativo)

3. RESOLVE quando cliente confirma: "resolvido", "obrigado", "funcionou", "deu certo", "fechou"

4. REOPEN se mencionar problema que já foi marcado como "resolvido"

5. Sempre gere subject conciso (máx 50 chars) e summary detalhado (máx 200 chars)

6. Categorize INTELIGENTEMENTE baseado no contexto, não em palavras-chave
   - Se categoria mudou = forte indicador de NEW_TICKET

${isGroup ? `
REGRAS ESPECIAIS PARA GRUPOS WHATSAPP:

IMPORTANTE: As mensagens de grupo vêm no formato "[Nome] mensagem" para você identificar quem está falando.
${args.ticket?.opened_by_name ? `O ticket atual foi aberto por: ${args.ticket.opened_by_name}` : ''}

7. CRIAR TICKET apenas para PEDIDOS REAIS de ajuda:
   ✅ Criar: "Alguém tem o playbook?", "Como faço X?", "Preciso de ajuda com Y", "Não consigo fazer Z"
   ❌ NÃO criar: "👍", "Bom dia", "Obrigado", mensagens casuais, reações, prints sem contexto

8. CONTINUE + status "em_atendimento" quando alguém PROMETE ajudar:
   - "Vamos verificar", "Já vou ver", "Vou analisar", "Deixa comigo"
   - Alguém assumiu o caso mas ainda não deu a solução
   - Exemplos:
     * "[Pedro] Não consigo acessar" → "[Luiz] Vamos verificar" = CONTINUE + status: em_atendimento
     * "[Pedro] Problema com convite" → "[Maria] Vou olhar isso" = CONTINUE + status: em_atendimento

9. RESOLVE quando há SOLUÇÃO REAL ou CONFIRMAÇÃO:
   - Alguém deu instrução/explicação/link concreto
   - Quem perguntou confirmou resolução: "funcionou", "obrigado", "deu certo"
   - Exemplos de RESOLVE:
     * "[Pedro] Como faço X?" → "[Maria] Vai em configurações > integrações..." = RESOLVE ✅
     * "[Pedro] Alguém tem o link?" → "[João] Aqui: https://..." = RESOLVE ✅
     * "[Pedro] Não consigo acessar" → "[Maria] Tenta limpar o cache" = RESOLVE ✅
     * "[Pedro] Obrigado, funcionou!" = RESOLVE ✅
   
10. CONTINUE (manter novo/aberto) quando:
    - Ninguém respondeu ainda
    - Resposta foi apenas emoji, "👍", "ok" sem explicação
    - Resposta foi outra pergunta, não uma ajuda
    - Quem perguntou mandou mais detalhes do problema
    - Exemplos:
      * "[Pedro] Como faço X?" → (sem resposta) = CONTINUE
      * "[Pedro] Como faço X?" → "[Maria] 👍" = CONTINUE (não é ajuda real)
      * "[Pedro] Como faço X?" → "[Maria] Também quero saber" = CONTINUE (não é ajuda)
` : ''}

RESPONDA APENAS EM JSON:
{
  "action": "WAIT|CONTINUE|NEW_TICKET|REOPEN|APPEND_KEEP_RESOLVED|RESOLVE",
  "confidence": 0.85,
  "subject": "Problema com bots inativos",
  "summary": "Cliente relatou que bots estão inativos por falta de créditos",
  "category": "slug_da_categoria",
  "status": "novo|em_atendimento|aguardando_cliente|resolvido",
  "reason": "Explicação da decisão"
}`;

  const ticketCtx = args.ticket
    ? {
        id: args.ticket.id,
        status: args.ticket.status,
        subject: args.ticket.subject,
        summary: args.ticket.llm_summary,
        opened_by_name: args.ticket.opened_by_name,
      }
    : null;

  const user = {
    channel: args.channel,
    ticket: ticketCtx,
    new_message: args.message,
    recent_messages: (args.recentMessages || []).slice(-8),
  };

  const body = {
    model: OPENAI_TICKET_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      ...safeRecent,
      { role: 'user', content: JSON.stringify(user) },
    ],
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    console.error('[TicketRouter] OpenAI error:', resp.status, JSON.stringify(json));
    return null;
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content);
    const action = String(parsed.action || parsed.decision || '').toUpperCase();
    const confidence = Number(parsed.confidence ?? 0);

    if (!['WAIT', 'CONTINUE', 'NEW_TICKET', 'REOPEN', 'APPEND_KEEP_RESOLVED', 'RESOLVE'].includes(action)) {
      return null;
    }

    return {
      action: action as TicketDecisionAction,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      subject: typeof parsed.subject === 'string' ? parsed.subject : undefined,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      status: typeof parsed.status === 'string' ? parsed.status : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      category: typeof parsed.category === 'string' ? parsed.category : undefined,
    };
  } catch {
    return null;
  }
}
