import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Renews Google Calendar watches that are expiring within 2 days.
 * Should be called daily via cron.
 */
serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find watches expiring within 2 days
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: members, error } = await supabase
      .from("team_members")
      .select("id, name, google_calendar_connected, google_calendar_watch_expiration")
      .eq("google_calendar_connected", true)
      .eq("is_active", true)
      .not("google_refresh_token", "is", null);

    if (error) {
      console.error("Error fetching members:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }

    const results: Array<{ name: string; status: string; error?: string }> = [];

    for (const member of members || []) {
      const expiration = member.google_calendar_watch_expiration;
      const isExpiring = !expiration || new Date(expiration) <= new Date(twoDaysFromNow);

      if (!isExpiring) {
        results.push({ name: member.name, status: "skipped (not expiring)" });
        continue;
      }

      console.log(`Renewing watch for ${member.name} (expires: ${expiration || "never set"})`);

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/setup-calendar-watch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ team_member_id: member.id }),
        });

        const result = await response.json();

        if (result.success) {
          results.push({ name: member.name, status: "renewed", });
        } else {
          results.push({ name: member.name, status: "failed", error: result.error });
        }
      } catch (err) {
        results.push({ name: member.name, status: "error", error: err.message });
      }
    }

    console.log("Renewal results:", results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
