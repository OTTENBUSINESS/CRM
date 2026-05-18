import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "36845942377-3gf0kttlo5cp3csg1a0nfo2dhgqia8ig.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

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

async function getValidAccessToken(supabase: any, teamMemberId: string) {
  const { data: member, error } = await supabase
    .from("team_members")
    .select("google_access_token, google_refresh_token, google_token_expires_at")
    .eq("id", teamMemberId)
    .single();

  if (error || !member) {
    throw new Error("Team member not found");
  }

  if (!member.google_access_token || !member.google_refresh_token) {
    throw new Error("Google Calendar not connected. Please connect in Settings.");
  }

  let accessToken = member.google_access_token;
  const tokenExpiry = member.google_token_expires_at ? new Date(member.google_token_expires_at) : new Date(0);

  if (tokenExpiry <= new Date()) {
    console.log("Token expired, refreshing...");
    const newTokens = await refreshAccessToken(member.google_refresh_token);

    if (!newTokens) {
      throw new Error("Failed to refresh Google token. Please reconnect in Settings.");
    }

    accessToken = newTokens.access_token;
    const newExpiry = new Date(Date.now() + newTokens.expires_in * 1000);

    await supabase
      .from("team_members")
      .update({
        google_access_token: accessToken,
        google_token_expires_at: newExpiry.toISOString(),
      })
      .eq("id", teamMemberId);
  }

  return accessToken;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { team_member_id, event, event_id, action } = await req.json();

    if (!team_member_id) {
      return new Response(
        JSON.stringify({ success: false, error: "team_member_id is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // DELETE action — remove event from Google Calendar
    if (action === "delete" && event_id) {
      const accessToken = await getValidAccessToken(supabase, team_member_id);
      const deleteUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(event_id)}`;

      console.log("Deleting Google Calendar event:", event_id);

      const deleteResponse = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // 204 = success, 410 = already deleted
      if (deleteResponse.status === 204 || deleteResponse.status === 410) {
        console.log("Event deleted successfully:", event_id);
        return new Response(
          JSON.stringify({ success: true, deleted: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const errorText = await deleteResponse.text();
      console.error("Failed to delete event:", errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Delete failed: ${deleteResponse.status} - ${errorText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: deleteResponse.status }
      );
    }

    if (!event || !event.summary || !event.startDateTime || !event.endDateTime) {
      return new Response(
        JSON.stringify({ success: false, error: "event with summary, startDateTime, endDateTime is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const accessToken = await getValidAccessToken(supabase, team_member_id);

    const calendarEvent: any = {
      summary: event.summary,
      description: event.description || "",
      start: {
        dateTime: event.startDateTime,
        timeZone: "America/Sao_Paulo",
      },
      end: {
        dateTime: event.endDateTime,
        timeZone: "America/Sao_Paulo",
      },
    };

    if (event.attendees && event.attendees.length > 0) {
      calendarEvent.attendees = event.attendees.map((email: string) => ({ email }));
    }

    // Add Google Meet conference data for new events
    if (!event_id) {
      calendarEvent.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    let url: string;
    let method: string;

    if (event_id) {
      // Update existing event
      url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(event_id)}?conferenceDataVersion=1`;
      method = "PATCH";
    } else {
      // Create new event
      url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1`;
      method = "POST";
    }

    console.log(`${method} Google Calendar event:`, JSON.stringify(calendarEvent));

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(calendarEvent),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Calendar API error:", errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Google Calendar API error: ${response.status} - ${errorText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: response.status }
      );
    }

    const result = await response.json();
    const meetLink = result.hangoutLink || result.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri || null;

    console.log("Event created/updated:", result.id, "Meet link:", meetLink);

    return new Response(
      JSON.stringify({
        success: true,
        eventId: result.id,
        meetLink,
        htmlLink: result.htmlLink,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Create calendar event error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
