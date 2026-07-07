/**
 * Debounce — agrupa mensagens do lead em janela de N segundos.
 *
 * Caso real: lead manda "oi" + "td bem?" + "queria saber sobre vcs"
 *           em 5s. SEM debounce: agente responde 3x. COM: espera, vê todas, responde 1x.
 *
 * Implementação: in-memory por session_id. Funciona pra chat web + 1 instance da
 * edge function. Pra WhatsApp em produção com múltiplas réplicas, evoluir pra
 * tabela persistente (ai_agent_message_queue OU nova `agents_debounce_queue`).
 *
 * Como funciona:
 *  1. Mensagem chega → registra timestamp + dispara timer
 *  2. Nova mensagem chega ANTES do timer expirar → RESET timer, acumula
 *  3. Timer expira → libera processamento com TODAS as msgs juntas
 *  4. Quem chamou waitDebounce vai receber só DEPOIS que terminar a janela
 */

interface DebounceEntry {
  lastMessageAt: number;
  pendingMessages: string[];           // queue de msgs do lead nesta janela
  resolve?: (msgs: string[]) => void;  // promise pendente da PRIMEIRA call
}

const debounceQueue = new Map<string, DebounceEntry>();

/**
 * Aguarda janela de debounce. Retorna array de TODAS as msgs do lead
 * recebidas durante a janela. A primeira call espera; calls subsequentes
 * só adicionam a msg na queue e retornam IMEDIATAMENTE com [] (sinaliza
 * que outra call já tá esperando).
 */
export async function waitDebounce(
  sessionKey: string,
  newMessage: string,
  windowSeconds: number,
): Promise<{ messages: string[]; isLeader: boolean }> {
  if (windowSeconds <= 0) {
    return { messages: [newMessage], isLeader: true };
  }

  const windowMs = windowSeconds * 1000;
  const existing = debounceQueue.get(sessionKey);

  // ── FOLLOWER: já tem alguém esperando, só anexa msg e sai
  if (existing && existing.resolve) {
    existing.pendingMessages.push(newMessage);
    existing.lastMessageAt = Date.now();
    return { messages: [], isLeader: false };
  }

  // ── LEADER: primeira call. Cria entry, espera janela.
  const entry: DebounceEntry = {
    lastMessageAt: Date.now(),
    pendingMessages: [newMessage],
  };

  const allMessages = await new Promise<string[]>((resolve) => {
    entry.resolve = resolve;
    debounceQueue.set(sessionKey, entry);

    const checkAndResolve = () => {
      const current = debounceQueue.get(sessionKey);
      if (!current) return;
      const elapsed = Date.now() - current.lastMessageAt;
      if (elapsed >= windowMs) {
        // janela expirou — libera com todas msgs acumuladas
        const msgs = [...current.pendingMessages];
        debounceQueue.delete(sessionKey);
        resolve(msgs);
      } else {
        // alguém adicionou msg → reagenda check pro tempo restante
        setTimeout(checkAndResolve, windowMs - elapsed);
      }
    };

    setTimeout(checkAndResolve, windowMs);
  });

  return { messages: allMessages, isLeader: true };
}

/** Limpa queues órfãos (housekeeping ocasional) */
export function cleanupStaleDebounce(maxAgeMs: number = 5 * 60_000): number {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of debounceQueue.entries()) {
    if (now - entry.lastMessageAt > maxAgeMs) {
      debounceQueue.delete(key);
      removed++;
    }
  }
  return removed;
}
