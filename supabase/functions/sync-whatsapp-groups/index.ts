import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface UAZAPIGroup {
  // Formato UAZAPI atual (PascalCase)
  JID?: string;
  Name?: string;
  OwnerJID?: string;
  Participants?: any[];
  // Formato legado (camelCase)
  id?: string;
  name?: string;
  subject?: string;
  owner?: string;
  creation?: number;
  participants?: any[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { instance_id } = body;

    if (!instance_id) {
      return new Response(
        JSON.stringify({ error: "instance_id é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Buscar dados da instância
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("id, api_key, api_url, name")
      .eq("id", instance_id)
      .single();

    if (instanceError || !instance) {
      return new Response(
        JSON.stringify({ error: "Instância não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    console.log(`🔄 Sincronizando grupos da instância: ${instance.name}`);

    // Chamar API UAZAPI para listar grupos
    const apiUrl = `${instance.api_url}/group/list`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "token": instance.api_key,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Erro UAZAPI:", errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar grupos da UAZAPI", details: errorText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const rawData = await response.json();
    // UAZAPI retorna { groups: [...] } ou array direto
    const groups: UAZAPIGroup[] = Array.isArray(rawData) ? rawData : (rawData.groups || []);
    console.log(`📋 ${groups.length} grupos encontrados`);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const group of groups) {
      try {
        // Compatível com PascalCase (novo) e camelCase (legado)
        const remoteJid = group.JID || group.id || "";
        const groupName = group.Name || group.subject || group.name || "Grupo sem nome";
        const ownerJid = group.OwnerJID || group.owner || null;
        const participantCount = group.Participants?.length || group.participants?.length || 0;
        if (!remoteJid) continue;

        // Verificar se já existe
        const { data: existing } = await supabase
          .from("whatsapp_groups")
          .select("id")
          .eq("group_jid", remoteJid)
          .eq("instance_id", instance_id)
          .single();

        if (existing) {
          // Atualizar nome + foto se mudou
          const updateData: Record<string, any> = {
            name: groupName,
            participant_count: participantCount,
            updated_at: new Date().toISOString(),
          };
          await supabase
            .from("whatsapp_groups")
            .update(updateData)
            .eq("id", existing.id);
          updated++;
        } else {
          // Criar novo
          await supabase
            .from("whatsapp_groups")
            .insert({
              instance_id: instance_id,
              group_jid: remoteJid,
              name: groupName,
              owner_jid: ownerJid,
              participant_count: participantCount,
              is_active: true,
              metadata: {
                creation: group.creation,
                synced_at: new Date().toISOString(),
              },
            });
          created++;
        }
      } catch (err) {
        console.error(`❌ Erro ao processar grupo ${group.id}:`, err);
        errors++;
      }
    }

    console.log(`✅ Sincronização concluída: ${created} criados, ${updated} atualizados, ${errors} erros`);

    return new Response(
      JSON.stringify({
        success: true,
        total: groups.length,
        created,
        updated,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ Erro geral:", error);
    return new Response(
      JSON.stringify({ error: error.message || String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
