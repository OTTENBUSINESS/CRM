// _shared/tenant-email-config.ts — ADAPTADO pro Otten (multi-tenant).
// Lê as credenciais do Resend da tabela `config` (key/value) via getIntegrationKey,
// mesmo padrão do Asaas. Mantém a MESMA API pública que os edges já importam
// (getEmailConfig / requireActiveConfig / EmailConfig) — então os edges não mudam
// a forma de chamar. O nome do arquivo é histórico; NÃO usa tabela email_config.
//
// Chaves esperadas na tabela `config`:
//   RESEND_API_KEY, RESEND_WEBHOOK_SECRET, EMAIL_FROM, EMAIL_FROM_NAME,
//   EMAIL_REPLY_TO, EMAIL_COMPANY_ADDRESS, EMAIL_COMPANY_NAME, APP_URL

import { getIntegrationKey } from "./config.ts";

export interface EmailConfig {
  id: string;
  resend_api_key: string | null;
  resend_webhook_secret: string | null;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  company_address: string | null;
  company_name: string | null;
  app_url: string | null;
  is_active: boolean;
  domain_verified: boolean;
}

// Alias histórico (compat com imports antigos)
export type TenantEmailConfig = EmailConfig;

/** Monta a config de email lendo as chaves da tabela `config`. */
export async function getEmailConfig(supabase: any): Promise<EmailConfig | null> {
  const apiKey = await getIntegrationKey(supabase, "RESEND_API_KEY");
  return {
    id: "config",
    resend_api_key: apiKey,
    resend_webhook_secret: await getIntegrationKey(supabase, "RESEND_WEBHOOK_SECRET"),
    from_email: await getIntegrationKey(supabase, "EMAIL_FROM"),
    from_name: await getIntegrationKey(supabase, "EMAIL_FROM_NAME"),
    reply_to: await getIntegrationKey(supabase, "EMAIL_REPLY_TO"),
    company_address: await getIntegrationKey(supabase, "EMAIL_COMPANY_ADDRESS"),
    company_name: await getIntegrationKey(supabase, "EMAIL_COMPANY_NAME"),
    app_url: await getIntegrationKey(supabase, "APP_URL"),
    is_active: !!apiKey,
    domain_verified: true,
  };
}

// Alias antigo (ignora tenantId se passado)
export async function getTenantConfig(supabase: any, _tenantId?: string): Promise<EmailConfig | null> {
  return getEmailConfig(supabase);
}

/** Garante que a config está utilizável; lança erro se faltar o essencial. */
export function requireActiveConfig(config: EmailConfig | null, _tenantId?: string): EmailConfig {
  if (!config || !config.resend_api_key) {
    throw new Error("RESEND_API_KEY não configurada. Preencha em Configurações → Integrações.");
  }
  if (!config.from_email) {
    throw new Error("EMAIL_FROM (remetente) não configurado em Configurações → Integrações.");
  }
  return config;
}
