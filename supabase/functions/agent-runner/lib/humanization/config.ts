/**
 * Humanização — config resolver.
 *
 * Lê settings.humanization do agente + canal atual e retorna a config aplicada.
 * Aplica defaults inteligentes (canais "humanizáveis" vs canais "diretos").
 */

export type Channel =
  | "whatsapp" | "telegram" | "instagram"
  | "chat_web" | "floating" | "sidebar" | "inbox" | "email" | "cron";

/** Canais onde humanização faz sentido por padrão */
const HUMANIZABLE_CHANNELS: Channel[] = ["whatsapp", "telegram", "instagram"];

export interface HumanizationConfig {
  enabled: boolean;
  channels: Channel[];                 // canais onde aplica
  debounce_seconds: number;            // agrupa msgs do lead em janela
  response_delay_min_ms: number;       // delay min antes de responder
  response_delay_max_ms: number;
  typing_indicator: boolean;           // envia "digitando..."
  message_split: {
    enabled: boolean;
    max_chars: number;                 // se passar disso, split
    delay_between_min_ms: number;
    delay_between_max_ms: number;
  };
}

export const DEFAULT_HUMANIZATION: HumanizationConfig = {
  enabled: false,
  channels: HUMANIZABLE_CHANNELS,
  debounce_seconds: 20,
  response_delay_min_ms: 2000,
  response_delay_max_ms: 5000,
  typing_indicator: true,
  message_split: {
    enabled: true,
    max_chars: 200,
    delay_between_min_ms: 1500,
    delay_between_max_ms: 3000,
  },
};

/**
 * Resolve config de humanização pra um agente + canal específico.
 * Retorna null se NÃO deve humanizar (canal off, agente off, canal não está na lista).
 */
export function resolveHumanization(
  settings: Record<string, unknown> | null | undefined,
  channel: string,
): HumanizationConfig | null {
  const raw = (settings as { humanization?: Partial<HumanizationConfig> } | null)?.humanization;
  if (!raw || raw.enabled === false) return null;

  const channels = Array.isArray(raw.channels) && raw.channels.length > 0
    ? raw.channels
    : DEFAULT_HUMANIZATION.channels;

  if (!channels.includes(channel as Channel)) return null;

  return {
    enabled: true,
    channels: channels as Channel[],
    debounce_seconds: raw.debounce_seconds ?? DEFAULT_HUMANIZATION.debounce_seconds,
    response_delay_min_ms: raw.response_delay_min_ms ?? DEFAULT_HUMANIZATION.response_delay_min_ms,
    response_delay_max_ms: raw.response_delay_max_ms ?? DEFAULT_HUMANIZATION.response_delay_max_ms,
    typing_indicator: raw.typing_indicator ?? DEFAULT_HUMANIZATION.typing_indicator,
    message_split: {
      enabled: raw.message_split?.enabled ?? DEFAULT_HUMANIZATION.message_split.enabled,
      max_chars: raw.message_split?.max_chars ?? DEFAULT_HUMANIZATION.message_split.max_chars,
      delay_between_min_ms:
        raw.message_split?.delay_between_min_ms ?? DEFAULT_HUMANIZATION.message_split.delay_between_min_ms,
      delay_between_max_ms:
        raw.message_split?.delay_between_max_ms ?? DEFAULT_HUMANIZATION.message_split.delay_between_max_ms,
    },
  };
}

/** Sleep aleatório dentro do range */
export function randomDelayMs(min: number, max: number): number {
  if (max <= min) return Math.max(0, min);
  return Math.floor(min + Math.random() * (max - min));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
