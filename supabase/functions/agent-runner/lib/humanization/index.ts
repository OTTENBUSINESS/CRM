/**
 * Humanização — barrel + helper de pipeline.
 *
 * Uso típico no agent-runner:
 *   const hum = resolveHumanization(agent.settings, channel);
 *   if (hum) {
 *     // 1. Debounce ANTES do LLM
 *     const { messages, isLeader } = await waitDebounce(sessionKey, userMsg, hum.debounce_seconds);
 *     if (!isLeader) return; // outra call já tá processando
 *     // Junta msgs do lead pra contexto: messages.join('\n')
 *
 *     // 2. Chama LLM normalmente
 *     const response = await callLLM(...);
 *
 *     // 3. Pipeline DEPOIS do LLM
 *     await humanizedSend({
 *       channel,
 *       config: hum,
 *       response,
 *       send: async (part) => { ...envia 1 parte... },
 *       typing: { ... opcional ... }
 *     });
 *   }
 */

export { DEFAULT_HUMANIZATION, resolveHumanization, randomDelayMs, sleep } from "./config.ts";
export type { HumanizationConfig, Channel } from "./config.ts";
export { waitDebounce, cleanupStaleDebounce } from "./debounce.ts";
export { splitMessage } from "./split.ts";
export { sendTypingIndicator } from "./typing.ts";
export type { TypingContext } from "./typing.ts";

import { randomDelayMs, sleep, type HumanizationConfig } from "./config.ts";
import { splitMessage } from "./split.ts";
import { sendTypingIndicator, type TypingContext } from "./typing.ts";

interface HumanizedSendParams {
  config: HumanizationConfig;
  response: string;
  /** Função que envia 1 parte (canal-specific) */
  send: (part: string, partIndex: number, totalParts: number) => Promise<void>;
  /** Opcional: contexto pra typing indicator */
  typing?: TypingContext;
}

/**
 * Aplica delay inicial + typing + split + delays entre partes.
 * Chama `send(part, i, total)` pra cada parte.
 */
export async function humanizedSend(params: HumanizedSendParams): Promise<void> {
  const { config, response, send, typing } = params;

  // 1. Typing indicator (fire-and-forget)
  if (config.typing_indicator && typing) {
    void sendTypingIndicator(typing);
  }

  // 2. Response delay inicial
  const initialDelay = randomDelayMs(config.response_delay_min_ms, config.response_delay_max_ms);
  if (initialDelay > 0) await sleep(initialDelay);

  // 3. Split (se ativo)
  const parts = config.message_split.enabled
    ? splitMessage(response, config.message_split.max_chars)
    : [response];

  // 4. Envia cada parte com delay entre elas
  for (let i = 0; i < parts.length; i++) {
    await send(parts[i], i, parts.length);

    const isLast = i === parts.length - 1;
    if (!isLast) {
      const between = randomDelayMs(
        config.message_split.delay_between_min_ms,
        config.message_split.delay_between_max_ms,
      );
      if (between > 0) await sleep(between);

      // Re-envia typing indicator antes da próxima parte
      if (config.typing_indicator && typing) {
        void sendTypingIndicator(typing);
      }
    }
  }
}
