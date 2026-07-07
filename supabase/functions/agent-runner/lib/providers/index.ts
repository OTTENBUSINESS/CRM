/**
 * Provider dispatcher.
 * Roteia chamada do LLM pro provider correto.
 *
 * Lookup de credencial: se agent.credential_id existe, busca em agents_provider_credentials.
 * Senão, fallback pra env vars (legacy).
 */

import type {
  AgentMessage,
  AgentRegistry,
  AgentTool,
  Attachment,
  ProviderCallResult,
  ProviderCredential,
} from "../../_shared/types.ts";
import { db } from "../../_shared/supabase.ts";
import { callAnthropic } from "./anthropic.ts";
import { callOpenAI } from "./openai.ts";
import { callOpenAICodex } from "./openai-codex.ts";

export interface CallProviderParams {
  agent: AgentRegistry;
  systemPrompt: string;
  tools: AgentTool[];
  history: AgentMessage[];
  newUserMessage: string;
  /** Anexos da mensagem atual (imagens). Providers que suportam vision passam multimodal. */
  newUserAttachments?: Attachment[];
  onTextDelta: (delta: string) => void;
  credential?: ProviderCredential | null;
  /** Ferramentas nativas do provider ligadas no agente (web_search, code_interpreter, image_generation) */
  nativeTools?: string[];
}

export async function callProvider(
  params: CallProviderParams,
): Promise<ProviderCallResult> {
  // Lookup credencial se agent referencia uma
  let credential: ProviderCredential | null = params.credential ?? null;
  if (!credential && params.agent.credential_id) {
    const { data } = await db
      .from("agents_provider_credentials")
      .select("*")
      .eq("id", params.agent.credential_id)
      .eq("is_active", true)
      .maybeSingle();
    credential = data as ProviderCredential | null;
    if (!credential) {
      throw new Error(
        `Credencial ${params.agent.credential_id} não encontrada ou inativa. ` +
        `Configura uma em /plataforma/agentes/credenciais.`,
      );
    }
  }

  const effective = { ...params, credential };

  // Provider type da credencial tem prioridade sobre agent.provider
  const providerType = credential?.provider_type || params.agent.provider;

  switch (providerType) {
    case "anthropic":
    case "anthropic_api":
      return await callAnthropic(effective);
    case "openai":
    case "openai_api":
      return await callOpenAI(effective);
    case "openai_codex":
      return await callOpenAICodex(effective);
    case "hermes":
      throw new Error("Provider 'hermes' não implementado ainda (Fase 2)");
    case "gemini":
    case "google_gemini":
      throw new Error("Provider 'gemini' não implementado ainda (Fase 2)");
    case "groq":
    case "together":
    case "fireworks":
    case "deepseek":
      // Esses são compatíveis com OpenAI Chat Completions — reuso o adapter
      return await callOpenAI(effective);
    case "custom":
      throw new Error("Provider 'custom' não implementado ainda (Fase 2)");
    default:
      throw new Error(`Provider desconhecido: ${providerType}`);
  }
}
