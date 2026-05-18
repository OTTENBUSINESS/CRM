import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Params: instance_id obrigatorio. api_url vem da propria instancia no DB (nao hardcoded).
    const instanceId = body.instance_id;
    if (!instanceId) {
      return new Response(JSON.stringify({ error: "instance_id e obrigatorio" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get instance API key + url from DB
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("id, name, api_key, api_url")
      .eq("id", instanceId)
      .single();

    if (!instance) {
      return new Response(
        JSON.stringify({ error: "Instance not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = body.api_key || instance.api_key;
    const apiUrl = body.api_url || instance.api_url;
    if (!apiUrl) {
      return new Response(JSON.stringify({ error: "api_url ausente na instancia" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Default: agora - 24h
    const startTs = body.start_timestamp_ms || (Date.now() - 24 * 60 * 60 * 1000);
    const endTs = body.end_timestamp_ms || Date.now();

    console.log(
      `[Sync] Starting sync for ${instance.name} (${instanceId})`,
      `from ${new Date(startTs).toISOString()} to ${new Date(endTs).toISOString()}`
    );

    // 2. Build lead phone lookup cache
    // Pre-fetch ALL leads with phone (paginated — Supabase default limit is 1000)
    const leadPhoneMap = new Map<string, string>();
    let leadOffset = 0;
    const leadPageSize = 1000;
    while (true) {
      const { data: leadPage } = await supabase
        .from("leads")
        .select("id, phone")
        .not("phone", "is", null)
        .not("phone", "like", "insta_%")
        .range(leadOffset, leadOffset + leadPageSize - 1);

      if (!leadPage || leadPage.length === 0) break;

      for (const lead of leadPage) {
        if (!lead.phone) continue;
        const cleanPhone = lead.phone.replace(/[^0-9]/g, "");
        leadPhoneMap.set(cleanPhone, lead.id);
        // Also map without country code (55)
        if (cleanPhone.startsWith("55") && cleanPhone.length > 10) {
          leadPhoneMap.set(cleanPhone.substring(2), lead.id);
        }
      }

      if (leadPage.length < leadPageSize) break;
      leadOffset += leadPageSize;
    }

    console.log(`[Sync] Loaded ${leadPhoneMap.size} lead phone entries (paginated)`);

    // Helper: find lead_id by phone (com normalização do 9º dígito)
    function findLeadByPhone(phone: string): string | null {
      const clean = phone.replace(/[^0-9]/g, "");
      // Match exato
      const direct = leadPhoneMap.get(clean) || leadPhoneMap.get("55" + clean) ||
        (clean.startsWith("55") ? leadPhoneMap.get(clean.substring(2)) : null);
      if (direct) return direct;

      // Match por últimos 8 dígitos (resolve 9º dígito)
      const last8 = clean.slice(-8);
      for (const [mapPhone, mapLeadId] of leadPhoneMap) {
        if (mapPhone.slice(-8) === last8) return mapLeadId;
      }
      return null;
    }

    // 3. Paginate through UAZAPI /message/find
    let offset = 0;
    const limit = 100;
    let totalFetched = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let totalGroups = 0;
    const errors: string[] = [];

    while (true) {
      console.log(`[Sync] Fetching offset=${offset}...`);

      let messages: any[] = [];
      let hasMore = false;

      try {
        const resp = await fetch(`${apiUrl}/message/find`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: apiKey,
          },
          body: JSON.stringify({
            startTimestamp: startTs,
            endTimestamp: endTs,
            limit,
            offset,
          }),
        });

        const rawText = await resp.text();
        // Clean control characters that break JSON parsing
        const cleanText = rawText.replace(
          /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
          " "
        );
        const data = JSON.parse(cleanText);
        messages = data.messages || [];
        hasMore = data.hasMore || false;
        totalFetched += messages.length;
      } catch (err) {
        console.error(`[Sync] Error fetching offset ${offset}:`, err);
        errors.push(`Fetch error at offset ${offset}: ${String(err)}`);
        // Try next page
        offset += limit;
        totalErrors++;
        if (offset > 5000) break; // Safety limit
        continue;
      }

      if (messages.length === 0) break;

      // 4. Process each message
      const rowsToInsert: any[] = [];

      for (const m of messages) {
        const chatid = m.chatid || "";

        // Skip groups
        if (chatid.includes("@g.us")) {
          totalGroups++;
          continue;
        }

        // Skip status/broadcast
        if (chatid === "status@broadcast" || !chatid) {
          continue;
        }

        // Skip failed/queued messages (UAZAPI retries that were never delivered)
        if (m.messageType === "Queued" || m.status === "Failed") {
          continue;
        }

        // Skip @lid format (Meta Linked ID) — can't resolve to phone/lead
        if (chatid.includes("@lid")) {
          continue;
        }

        // Build message_id (same format as webhook: "owner:messageid")
        const messageId = m.id || `${m.owner}:${m.messageid}`;

        // Extract phone from chatid
        const isPhoneJid = chatid.includes("@s.whatsapp.net");
        const phone = isPhoneJid
          ? chatid.split("@")[0]
          : null;

        // Resolve lead_id
        const leadId = phone ? findLeadByPhone(phone) : null;

        // Determine sender_phone
        const senderPhone = m.fromMe
          ? (m.owner || "")
          : (phone || chatid.split("@")[0] || "");

        // Determine content
        const content =
          m.text ||
          (m.messageType === "AudioMessage"
            ? "[Audio]"
            : m.messageType === "ImageMessage"
            ? "[Imagem]"
            : m.messageType === "VideoMessage"
            ? "[Video]"
            : m.messageType === "DocumentMessage" || m.messageType === "DocumentWithCaptionMessage"
            ? "[Documento]"
            : m.messageType === "StickerMessage"
            ? "[Sticker]"
            : m.messageType === "LocationMessage"
            ? "[Localização]"
            : m.messageType === "ContactMessage"
            ? "[Contato]"
            : m.messageType === "ReactionMessage"
            ? null // Skip reactions
            : "[Media]");

        // Skip reactions
        if (content === null) continue;

        // Determine media_url
        const mediaUrl = m.fileURL || null;

        // Build sent_at from messageTimestamp (milliseconds)
        const sentAt = new Date(m.messageTimestamp).toISOString();

        // Map UAZAPI status to our status
        const status =
          m.status === "Read"
            ? "read"
            : m.status === "Delivered"
            ? "delivered"
            : "sent";

        // Msgs sem lead_id: inserir mesmo assim (inbox resolve pelo telefone)
        // Antes descartava, agora insere pra não perder msgs

        rowsToInsert.push({
          instance_id: instanceId,
          lead_id: leadId,
          message_id: messageId,
          remote_jid: chatid,
          sender_phone: senderPhone,
          sender_name: m.senderName || "",
          content,
          message_type: m.messageType || "text",
          media_url: mediaUrl,
          is_from_me: m.fromMe || false,
          status,
          sent_at: sentAt,
          metadata: { synced_from_uazapi: true, original_source: m.source || "" },
        });
      }

      // 5. Batch upsert (ON CONFLICT DO NOTHING to skip duplicates)
      if (rowsToInsert.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from("whatsapp_messages")
          .upsert(rowsToInsert, {
            onConflict: "instance_id,message_id",
            ignoreDuplicates: true,
          })
          .select("id");

        if (insertError) {
          console.error(`[Sync] Insert error at offset ${offset}:`, insertError);
          errors.push(`Insert error at offset ${offset}: ${insertError.message}`);
          totalErrors++;
        } else {
          const insertedCount = inserted?.length || 0;
          totalInserted += insertedCount;
          totalSkipped += rowsToInsert.length - insertedCount;
          console.log(
            `[Sync] Offset ${offset}: ${rowsToInsert.length} prepared, ${insertedCount} inserted, ${rowsToInsert.length - insertedCount} skipped (duplicate)`
          );
        }
      }

      if (!hasMore) break;
      offset += limit;

      // Safety limit: 5000 messages max
      if (offset > 5000) {
        console.log("[Sync] Safety limit reached (5000)");
        break;
      }
    }

    const result = {
      success: true,
      instance: instance.name,
      period: {
        from: new Date(startTs).toISOString(),
        to: new Date(endTs).toISOString(),
      },
      stats: {
        total_fetched: totalFetched,
        total_inserted: totalInserted,
        total_skipped_duplicate: totalSkipped,
        total_groups_skipped: totalGroups,
        total_errors: totalErrors,
      },
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log("[Sync] Complete:", JSON.stringify(result));

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Sync] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
