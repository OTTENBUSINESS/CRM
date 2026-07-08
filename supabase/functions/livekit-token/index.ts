import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.7.0";
import { getIntegrationKey } from "../_shared/config.ts";

/**
 * LiveKit — Geração de token JWT pra entrar na sala (/meet/:roomId)
 *
 * Roles:
 *   - host: publica, gerencia a sala e grava (roomAdmin + roomRecord)
 *   - guest: publica e participa (default)
 *   - observer: invisível (hidden), só escuta + envia DataChannel
 *
 * PÚBLICO (verify_jwt = false): o convidado da reunião NÃO tem login no CRM.
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

    const { roomName, participantName, role, metadata } = await req.json();

    if (!roomName || !participantName) {
      return jsonRes({ error: "roomName e participantName são obrigatórios" }, 400);
    }

    const identity = `${role || "guest"}-${participantName}-${Date.now()}`;
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: participantName,
      metadata: JSON.stringify(metadata || {}),
    });

    // Permissões por role
    if (role === "host") {
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: true,
        roomRecord: true,
      });
    } else if (role === "observer") {
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: false,
        canSubscribe: true,
        canPublishData: true,
        hidden: true, // invisível pros outros participantes
      });
    } else {
      // guest
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
    }

    const token = await at.toJwt();

    return jsonRes({ token, url: livekitUrl });
  } catch (err: any) {
    console.error("[livekit-token] Error:", err.message);
    return jsonRes({ error: err.message }, 500);
  }
});

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
