/**
 * agents-codex-import — recebe o conteúdo do ~/.codex/auth.json do aluno,
 * extrai tokens, valida com refresh, salva na agents_provider_credentials.
 *
 * Body:
 *   {
 *     auth_json: { ... },        // conteúdo completo do ~/.codex/auth.json
 *     label?: string,            // default "Codex CLI"
 *     owner_user_id?: string,    // team_member id (opcional)
 *     is_shared?: boolean        // default false
 *   }
 *
 * Response:
 *   { ok: true, credential_id, expires_at, account_id, refreshed: bool }
 *   { ok: false, error }
 *
 * Comportamento:
 *   - Parse robusto (aceita string ou objeto)
 *   - Se token expirado → tenta refresh imediato e salva já renovado
 *   - Idempotente: se já existe credencial pra esse account_id, faz UPDATE
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_TOKEN = "https://auth.openai.com/oauth/token";

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function decodeJwtExp(jwt: string): number | undefined {
  try {
    const [, payload] = jwt.split(".");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp : undefined;
  } catch { return undefined; }
}

async function refreshToken(refresh_token: string, account_id: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id: CODEX_CLIENT_ID,
    scope: "openid profile email offline_access",
  });
  const res = await fetch(OPENAI_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`refresh ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string) || refresh_token,
    account_id,
    expires_at: decodeJwtExp(data.access_token) ??
      (data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined),
    last_refresh_at: new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  }

  let payload: any;
  try { payload = await req.json(); }
  catch { return jsonResp({ ok: false, error: "invalid_json" }, 400); }

  // auth_json pode chegar como string OR objeto
  let authJson: any = payload.auth_json;
  if (typeof authJson === "string") {
    try { authJson = JSON.parse(authJson); }
    catch { return jsonResp({ ok: false, error: "auth_json não é JSON válido" }, 400); }
  }
  if (!authJson || typeof authJson !== "object") {
    return jsonResp({ ok: false, error: "auth_json ausente" }, 400);
  }

  // ~/.codex/auth.json tem { tokens: { access_token, refresh_token, account_id, id_token } }
  // tolerância: aceita também o objeto plano sem wrapper
  const tokens = authJson.tokens || authJson;
  const access_token: string | undefined = tokens.access_token;
  const refresh_token: string | undefined = tokens.refresh_token;
  const account_id: string | undefined = tokens.account_id;

  if (!access_token || !account_id) {
    return jsonResp({ ok: false, error: "auth_json sem access_token ou account_id" }, 400);
  }

  let auth = {
    access_token,
    refresh_token,
    account_id,
    expires_at: decodeJwtExp(access_token),
    last_refresh_at: undefined as string | undefined,
  };

  // Se já expirou ou expira em <30min e tem refresh → renova agora
  const nowS = Date.now() / 1000;
  let refreshed = false;
  if (refresh_token && (!auth.expires_at || auth.expires_at < nowS + 1800)) {
    try {
      auth = await refreshToken(refresh_token, account_id) as any;
      refreshed = true;
    } catch (e: any) {
      // refresh falhou — pode ser refresh_token revogado
      return jsonResp({ ok: false, error: `refresh falhou: ${e.message}`, hint: "Rode `codex login` novamente" }, 401);
    }
  }

  const label = payload.label || "Codex CLI";
  const owner_user_id = payload.owner_user_id || null;
  const is_shared = !!payload.is_shared;

  // Idempotente: procura por credencial existente desse account_id
  const { data: existing } = await db
    .from("agents_provider_credentials")
    .select("id")
    .eq("provider_type", "openai_codex")
    .filter("auth_data->>account_id", "eq", account_id)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db
      .from("agents_provider_credentials")
      .update({
        auth_data: auth,
        label,
        is_active: true,
        last_refreshed_at: refreshed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return jsonResp({ ok: false, error: error.message }, 500);
    return jsonResp({
      ok: true,
      credential_id: existing.id,
      account_id,
      expires_at: auth.expires_at,
      refreshed,
      updated: true,
    });
  }

  const { data: inserted, error } = await db
    .from("agents_provider_credentials")
    .insert({
      provider_type: "openai_codex",
      label,
      auth_data: auth,
      owner_user_id,
      is_shared,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) return jsonResp({ ok: false, error: error.message }, 500);

  return jsonResp({
    ok: true,
    credential_id: inserted.id,
    account_id,
    expires_at: auth.expires_at,
    refreshed,
    created: true,
  });
});

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
