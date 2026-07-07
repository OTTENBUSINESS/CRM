/**
 * Cliente Supabase compartilhado.
 * Usa service role pra bypassar RLS (edge function trusted).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("[agent-runner] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes nos secrets");
}

export const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "public" },
});

export { SUPABASE_URL };
