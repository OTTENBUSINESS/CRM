/**
 * Tipos compartilhados da plataforma de agentes IAP.
 * Schema espelha cs/AGENTS-PLATFORM.md § 3.
 */

export type Provider =
  | "anthropic"
  | "openai"
  | "openai_codex"  // OAuth via ChatGPT subscription
  | "gemini"
  | "hermes"
  | "custom";

export type CredentialProviderType =
  | "anthropic_api"
  | "openai_api"
  | "openai_codex"
  | "google_gemini"
  | "groq"
  | "together"
  | "fireworks"
  | "deepseek"
  | "custom";

export interface ProviderCredential {
  id: string;
  owner_user_id: string;
  provider_type: CredentialProviderType;
  label: string;
  auth_data: Record<string, any>;
  metadata: Record<string, any>;
  is_active: boolean;
}

export type ToolActionType =
  | "sql"
  | "http"
  | "webhook"
  | "edge_function";

export type DeploymentChannel =
  | "whatsapp"
  | "chat_web"
  | "floating"
  | "sidebar"
  | "inbox"
  | "telegram"
  | "instagram"
  | "email"
  | "cron";

export type MessageRole = "user" | "assistant" | "tool" | "system";

export type SessionStatus = "active" | "paused" | "closed";

export type MessageStatus = "streaming" | "completed" | "failed";

// ────────── Banco ──────────

export interface AgentRegistry {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  emoji: string | null;
  provider: Provider;
  model: string;
  endpoint_url: string | null;
  system_prompt: string;
  settings: AgentSettings;
  daily_token_limit: number | null;
  daily_cost_limit_brl: number | null;
  version: number;
  is_active: boolean;
  credential_id?: string | null;
}

export interface AgentSettings {
  temperature?: number;
  max_tokens?: number;
  caching?: {
    enabled?: boolean;
    system_ttl?: "5m" | "1h";
    user_ttl?: "5m" | "1h";
    min_tokens?: number;
  };
  sliding_window?: number;
  summarize_after_msgs?: number;
  triage_model?: string;
  log_sample_rate?: number; // 0..1
  [k: string]: unknown;
}

export interface AgentTool {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  parameters_schema: Record<string, unknown>;
  action_type: ToolActionType;
  action_config: Record<string, unknown>;
  requires_approval: boolean;
  is_active: boolean;
}

export interface AgentSession {
  id: string;
  agent_id: string;
  user_id: string | null;
  channel: string;
  title: string | null;
  working_memory: Record<string, unknown>;
  summary: string | null;
  provider_state: Record<string, unknown>;
  status: SessionStatus;
}

export interface AgentMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string | null;
  tool_calls: ToolCall[] | null;
  tool_call_id: string | null;
  token_count: number | null;
  cost_brl: number | null;
  status: MessageStatus;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CoreMemoryBlock {
  block_key: string;
  content: string;
}

// ────────── Requisição/Resposta ──────────

export interface AgentRunRequest {
  agent_slug: string;
  channel: DeploymentChannel | string;
  session_id?: string | null;
  message: string;
  attachments?: Attachment[];
  user_id?: string | null;
  context?: Record<string, unknown>;
  idempotency_key?: string;
}

export interface Attachment {
  url: string;
  type: 'image';
  name?: string;
  media_type?: string;        // ex 'image/png' — opcional, infere da URL se ausente
}

export interface AgentRunUsage {
  input_tokens: number;
  output_tokens: number;
  cached_tokens?: number;
}

export interface ProviderCallResult {
  // streaming events do provider já são enviados via callback;
  // este resultado é o agregado final.
  text: string;
  tool_calls: ToolCall[];
  usage: AgentRunUsage;
  cost_brl: number;
  raw?: Record<string, unknown>;
  stop_reason?: string;
}

// ────────── Eventos SSE pro cliente ──────────

export type SseEvent =
  | { type: "session.info"; session_id: string }
  | { type: "text.delta"; delta: string }
  | { type: "tool.start"; tool: string; arguments: Record<string, unknown> }
  | { type: "tool.end"; tool: string; output?: unknown; error?: string }
  | { type: "done"; usage?: AgentRunUsage; cost_brl?: number }
  | { type: "error"; message: string };
