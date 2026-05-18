import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Parse optional params
    const url = new URL(req.url);
    const batchSize = parseInt(url.searchParams.get("batch") || "50");
    const dryRun = url.searchParams.get("dry") === "true";

    // Find leads with non-storage photo URLs (WhatsApp CDN URLs that expire)
    const { data: leads, error: fetchError } = await supabase
      .from("leads")
      .select("id, photo_url, phone")
      .not("photo_url", "is", null)
      .not("photo_url", "like", "%supabase.co/storage%")
      .not("photo_url", "like", "%profile-photos%")
      .limit(batchSize);

    if (fetchError) throw fetchError;

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ message: "No leads to migrate", migrated: 0, failed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          message: "Dry run",
          would_migrate: leads.length,
          sample: leads.slice(0, 5).map((l) => ({
            id: l.id,
            current_url: l.photo_url?.substring(0, 80) + "...",
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let migrated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        if (!lead.photo_url) continue;

        // Download the photo from WhatsApp CDN
        const photoResponse = await fetch(lead.photo_url);
        if (!photoResponse.ok) {
          // URL expired - try fetching from UAZAPI if we have phone
          if (lead.phone) {
            const freshUrl = await fetchFreshPhoto(supabase, lead.phone);
            if (freshUrl) {
              const permanentUrl = await uploadToStorage(supabase, freshUrl, lead.id);
              if (permanentUrl) {
                await supabase
                  .from("leads")
                  .update({ photo_url: permanentUrl })
                  .eq("id", lead.id);
                migrated++;
                continue;
              }
            }
          }
          failed++;
          errors.push(`${lead.id}: URL expired, no fresh photo available`);
          continue;
        }

        const blob = await photoResponse.arrayBuffer();
        if (blob.byteLength === 0) {
          failed++;
          errors.push(`${lead.id}: Empty response`);
          continue;
        }

        const contentType = photoResponse.headers.get("content-type") || "image/jpeg";
        const ext = contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
            ? "webp"
            : "jpg";

        const filePath = `leads/${lead.id}.${ext}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("profile-photos")
          .upload(filePath, blob, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          failed++;
          errors.push(`${lead.id}: Upload failed - ${uploadError.message}`);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("profile-photos")
          .getPublicUrl(filePath);

        const permanentUrl = urlData?.publicUrl;
        if (!permanentUrl) {
          failed++;
          errors.push(`${lead.id}: Could not get public URL`);
          continue;
        }

        // Update lead with permanent URL
        await supabase
          .from("leads")
          .update({ photo_url: permanentUrl })
          .eq("id", lead.id);

        migrated++;

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        failed++;
        errors.push(`${lead.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Migration complete",
        total: leads.length,
        migrated,
        failed,
        errors: errors.slice(0, 20), // Only return first 20 errors
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});

/**
 * Try to fetch a fresh photo URL from UAZAPI for a given phone number.
 * Uses the first connected WhatsApp instance.
 */
async function fetchFreshPhoto(
  supabase: ReturnType<typeof createClient>,
  phone: string,
): Promise<string | null> {
  try {
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("api_key, api_url, metadata")
      .eq("status", "connected")
      .limit(1)
      .single();

    if (!instance?.api_key) return null;

    const metadata = (instance.metadata as Record<string, unknown>) || {};
    const uazapiUrl =
      (instance.api_url as string) || (metadata.uazapi_url as string) || "";
    if (!uazapiUrl) {
      console.warn("[migrate] Instance sem api_url, pulando");
      return null;
    }

    const cleanPhone = phone.replace(/\D/g, "");

    const response = await fetch(`${uazapiUrl}/chat/details`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: instance.api_key,
      },
      body: JSON.stringify({ number: cleanPhone, preview: true }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.image || data.imagePreview || null;
  } catch {
    return null;
  }
}

/**
 * Upload a photo URL to Supabase Storage and return the permanent URL.
 */
async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  photoUrl: string,
  leadId: string,
): Promise<string | null> {
  try {
    const response = await fetch(photoUrl);
    if (!response.ok) return null;

    const blob = await response.arrayBuffer();
    if (blob.byteLength === 0) return null;

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";

    const filePath = `leads/${leadId}.${ext}`;

    const { error } = await supabase.storage
      .from("profile-photos")
      .upload(filePath, blob, { contentType, upsert: true });

    if (error) return null;

    const { data: urlData } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(filePath);

    return urlData?.publicUrl || null;
  } catch {
    return null;
  }
}
