import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isAuthorizedCaller, unauthorizedResponse } from "../_shared/requireCaller.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  if (req.method !== "OPTIONS" && !isAuthorizedCaller(req)) return unauthorizedResponse();
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar todas as instancias com api_key (token UAZAPI)
    const { data: instances, error } = await supabase
      .from('whatsapp_instances')
      .select('id, name, status, api_key, api_url')
      .not('api_key', 'is', null);

    if (error || !instances?.length) {
      console.log('[SyncStatus] No instances found or error:', error?.message);
      return new Response(JSON.stringify({ synced: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ name: string; dbStatus: string; uazapiStatus: string; updated: boolean }> = [];

    for (const inst of instances) {
      try {
        if (!inst.api_url) {
          console.log(`[SyncStatus] ${inst.name}: missing api_url, skipping`);
          results.push({ name: inst.name, dbStatus: inst.status, uazapiStatus: 'no_api_url', updated: false });
          continue;
        }
        // Consultar status real na UAZAPI via /instance/status
        const resp = await fetch(`${inst.api_url}/instance/status`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'token': inst.api_key },
        });

        if (!resp.ok) {
          console.log(`[SyncStatus] ${inst.name}: UAZAPI returned ${resp.status}`);
          results.push({ name: inst.name, dbStatus: inst.status, uazapiStatus: `error:${resp.status}`, updated: false });
          continue;
        }

        const data = await resp.json();
        // UAZAPI /instance/status retorna:
        // { instance: { status: "connected"|"disconnected" }, status: { connected: true/false, loggedIn: true/false } }
        let realStatus = 'disconnected';
        if (data.status?.connected === true || data.instance?.status === 'connected') {
          realStatus = 'connected';
        } else if (data.instance?.status === 'connecting') {
          realStatus = 'connecting';
        }

        const needsUpdate = inst.status !== realStatus;
        if (needsUpdate) {
          console.log(`[SyncStatus] ${inst.name}: DB="${inst.status}" -> UAZAPI="${realStatus}" — UPDATING`);
          await supabase
            .from('whatsapp_instances')
            .update({ status: realStatus })
            .eq('id', inst.id);
        }

        results.push({ name: inst.name, dbStatus: inst.status, uazapiStatus: realStatus, updated: needsUpdate });
      } catch (err: any) {
        console.error(`[SyncStatus] ${inst.name}: Error polling UAZAPI:`, err.message);
        results.push({ name: inst.name, dbStatus: inst.status, uazapiStatus: `error:${err.message}`, updated: false });
      }
    }

    const updatedCount = results.filter(r => r.updated).length;
    console.log(`[SyncStatus] Done. ${updatedCount}/${results.length} instances updated.`);

    return new Response(JSON.stringify({ synced: results.length, updated: updatedCount, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SyncStatus] Fatal error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
