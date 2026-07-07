/**
 * Tool type: Webhook — dispara workflow externo (Zapier/n8n/Make/Slack).
 *
 * Wrapper de HTTP POST com fire-and-forget option.
 *
 * action_config exemplo:
 *   {
 *     "url": "https://hooks.slack.com/services/T123/B456/xxx",
 *     "fire_and_forget": false
 *   }
 */

import { execHttpTool } from "./http.ts";

export async function execWebhookTool(params: {
  action_config: Record<string, unknown>;
  arguments: Record<string, unknown>;
  user_id: string | null;
}): Promise<unknown> {
  // Webhook = HTTP POST com Content-Type JSON + body = arguments raw
  const cfg = {
    ...params.action_config,
    method: "POST",
    body: params.arguments,
  };

  // Fire-and-forget: não bloqueia LLM esperando resposta
  if (params.action_config.fire_and_forget) {
    execHttpTool({ action_config: cfg, arguments: params.arguments, user_id: params.user_id })
      .catch((e) => console.error("[tools/webhook] fire-forget err", e));
    return { acked: true };
  }

  return await execHttpTool({
    action_config: cfg,
    arguments: params.arguments,
    user_id: params.user_id,
  });
}
