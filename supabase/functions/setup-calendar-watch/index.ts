import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "36845942377-3gf0kttlo5cp3csg1a0nfo2dhgqia8ig.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

// Refresh access token if expired
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error("Failed to refresh token:", await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { team_member_id, action = "setup" } = await req.json();

    if (!team_member_id) {
      return new Response(
        JSON.stringify({ success: false, error: "team_member_id is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get team member's Google tokens
    const { data: member, error: memberError } = await supabase
      .from("team_members")
      .select("google_access_token, google_refresh_token, google_token_expires_at, google_calendar_watch_channel_id, google_calendar_watch_resource_id")
      .eq("id", team_member_id)
      .single();

    if (memberError || !member) {
      return new Response(
        JSON.stringify({ success: false, error: "Team member not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if (!member.google_access_token || !member.google_refresh_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Google Calendar not connected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check if token is expired and refresh if needed
    let accessToken = member.google_access_token;
    const tokenExpiry = member.google_token_expires_at ? new Date(member.google_token_expires_at) : new Date(0);
    
    if (tokenExpiry <= new Date()) {
      const newTokens = await refreshAccessToken(member.google_refresh_token);
      
      if (!newTokens) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to refresh Google token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }

      accessToken = newTokens.access_token;
      const newExpiry = new Date(Date.now() + newTokens.expires_in * 1000);

      await supabase
        .from("team_members")
        .update({
          google_access_token: accessToken,
          google_token_expires_at: newExpiry.toISOString(),
        })
        .eq("id", team_member_id);
    }

    if (action === "stop" && member.google_calendar_watch_channel_id) {
      // Stop existing watch
      console.log("Stopping existing watch...");
      
      await fetch(
        "https://www.googleapis.com/calendar/v3/channels/stop",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: member.google_calendar_watch_channel_id,
            resourceId: member.google_calendar_watch_resource_id,
          }),
        }
      );

      await supabase
        .from("team_members")
        .update({
          google_calendar_watch_channel_id: null,
          google_calendar_watch_resource_id: null,
          google_calendar_watch_expiration: null,
        })
        .eq("id", team_member_id);

      return new Response(
        JSON.stringify({ success: true, message: "Watch stopped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Setup new watch
    const channelId = crypto.randomUUID();
    const webhookUrl = `${supabaseUrl}/functions/v1/google-calendar-webhook`;
    
    // Watch expires in 7 days (Google's max is ~30 days)
    const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

    console.log("Setting up calendar watch...", { channelId, webhookUrl });

    const watchResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/watch",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: channelId,
          type: "web_hook",
          address: webhookUrl,
          token: team_member_id, // Pass team_member_id as token for identification
          expiration: expiration.toString(),
        }),
      }
    );

    if (!watchResponse.ok) {
      const error = await watchResponse.text();
      console.error("Failed to setup watch:", error);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to setup watch: ${error}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const watchResult = await watchResponse.json();
    console.log("Watch setup result:", watchResult);

    // Save watch info
    await supabase
      .from("team_members")
      .update({
        google_calendar_watch_channel_id: watchResult.id,
        google_calendar_watch_resource_id: watchResult.resourceId,
        google_calendar_watch_expiration: new Date(parseInt(watchResult.expiration)).toISOString(),
      })
      .eq("id", team_member_id);

    // Do initial sync
    const syncResponse = await fetch(
      `${supabaseUrl}/functions/v1/sync-google-calendar`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          team_member_id: team_member_id,
          full_sync: true,
        }),
      }
    );

    const syncResult = await syncResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Calendar watch setup successfully",
        watch: {
          channelId: watchResult.id,
          expiration: new Date(parseInt(watchResult.expiration)).toISOString(),
        },
        initialSync: syncResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Setup error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
