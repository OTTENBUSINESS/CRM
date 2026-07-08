import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RoomServiceClient } from "https://esm.sh/livekit-server-sdk@2.7.0";
import { getIntegrationKey } from "../_shared/config.ts";

/**
 * LiveKit — Encerra a sala pra todos (host clicou "Sair")
 *
 * DeleteRoom no servidor kicka todos os participantes e finaliza o Egress.
 * Sem isso, o lead fica sozinho na sala mesmo depois do host sair.
 * O update em `meetings` (status/ended_at) é feito pelo webhook `room_finished`.
 *
 * PÚBLICO (verify_jwt = false): chamado da página pública /meet/:roomId,
 * onde o convidado NÃO tem login no CRM.
 * Chaves lidas da tabela `config` via getIntegrationKey (fallback Deno.env, cache 60s).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Chaves resolvidas em runtime (tabela config > Deno.env)
    const [apiKey, apiSecret, livekitUrl] = await Promise.all([
      getIntegrationKey(supabase, "LIVEKIT_API_KEY"),
      getIntegrationKey(supabase, "LIVEKIT_API_SECRET"),
      getIntegrationKey(supabase, "LIVEKIT_URL"),
    ]);

    if (!apiKey || !apiSecret || !livekitUrl) {
      return jsonRes(
        {
          error:
            "LiveKit não configurado — preencha LIVEKIT_API_KEY/SECRET/URL em Configurações → Integrações",
        },
        500
      );
    }

    const { room_name } = await req.json();
    if (!room_name) {
      return jsonRes({ error: "room_name required" }, 400);
    }

    const rs = new RoomServiceClient(
      livekitUrl.replace("wss://", "https://"),
      apiKey,
      apiSecret
    );

    await rs.deleteRoom(room_name);

    return jsonRes({ success: true });
  } catch (err: any) {
    console.error("[livekit-end-room] Error:", err.message);
    return jsonRes({ error: err.message }, 500);
  }
});

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
