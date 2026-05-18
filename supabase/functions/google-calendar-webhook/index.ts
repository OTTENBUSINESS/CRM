import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-goog-channel-id, x-goog-channel-token, x-goog-resource-id, x-goog-resource-state, x-goog-resource-uri, x-goog-message-number",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Google sends these headers with webhook notifications
    const channelId = req.headers.get("x-goog-channel-id");
    const resourceState = req.headers.get("x-goog-resource-state");
    const resourceId = req.headers.get("x-goog-resource-id");
    const channelToken = req.headers.get("x-goog-channel-token"); // Contains team_member_id

    console.log("📅 Google Calendar Webhook received:", {
      channelId,
      resourceState,
      resourceId,
      channelToken,
    });

    // Ignore sync messages (initial verification)
    if (resourceState === "sync") {
      console.log("Sync verification received, acknowledging...");
      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    // For actual changes, trigger a sync
    if (resourceState === "exists" && channelToken) {
      const teamMemberId = channelToken;

      console.log(`Triggering sync for team member: ${teamMemberId}`);

      // Call the sync function
      const syncResponse = await fetch(
        `${supabaseUrl}/functions/v1/sync-google-calendar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            team_member_id: teamMemberId,
            full_sync: false, // Incremental sync using sync token
          }),
        }
      );

      const syncResult = await syncResponse.json();
      console.log("Sync result:", syncResult);

      // Log the webhook event
      await supabase.from("calendar_webhook_logs").insert({
        channel_id: channelId,
        resource_id: resourceId,
        resource_state: resourceState,
        team_member_id: teamMemberId,
        sync_result: syncResult,
      }).catch(() => {
        // Table might not exist, ignore
      });
    }

    return new Response("OK", { headers: corsHeaders, status: 200 });

  } catch (error) {
    console.error("Webhook error:", error);
    // Always return 200 to Google to prevent retries
    return new Response("OK", { headers: corsHeaders, status: 200 });
  }
});
