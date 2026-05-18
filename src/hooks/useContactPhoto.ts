import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface ContactDetails {
  name: string | null;
  photo_url: string | null;
}

/**
 * Downloads a photo from URL and uploads to Supabase Storage (profile-photos bucket).
 * Returns the permanent public URL.
 */
async function uploadPhotoToStorage(
  photoUrl: string,
  leadId: string,
): Promise<string | null> {
  try {
    // Download the photo
    const response = await fetch(photoUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    if (blob.size === 0) return null;

    // Determine extension from content type
    const contentType = blob.type || "image/jpeg";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";

    const filePath = `leads/${leadId}.${ext}`;

    // Upload to Supabase Storage (upsert to overwrite old photos)
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(filePath, blob, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[useContactPhoto] Upload failed:", uploadError.message);
      return null;
    }

    // Get public URL (bucket is public)
    const { data: urlData } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(filePath);

    return urlData?.publicUrl || null;
  } catch (err) {
    console.error("[useContactPhoto] Failed to upload photo to storage:", err);
    return null;
  }
}

/**
 * Checks if a URL is already a Supabase Storage URL (permanent).
 */
function isStorageUrl(url: string): boolean {
  return url.includes("supabase.co/storage/") || url.includes("/profile-photos/");
}

/**
 * Fetches contact photo from UAZAPI /chat/details, uploads to Supabase Storage,
 * and saves the permanent URL to leads.photo_url.
 *
 * Only fetches if:
 * - Lead has no photo_url, OR
 * - Existing photo_url is a temporary WhatsApp CDN URL (not in Supabase Storage)
 */
export const useContactPhoto = (
  phone: string | null | undefined,
  leadId: string | null | undefined,
  instanceId: string | null | undefined,
  existingPhotoUrl: string | null | undefined,
) => {
  const queryClient = useQueryClient();

  // Skip if already stored in Supabase Storage
  const needsFetch =
    !!phone &&
    !!leadId &&
    !!instanceId &&
    (!existingPhotoUrl || !isStorageUrl(existingPhotoUrl));

  return useQuery({
    queryKey: ["contact-photo", leadId],
    queryFn: async (): Promise<ContactDetails | null> => {
      if (!phone || !leadId || !instanceId) return null;

      // Fetch instance API key and metadata
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("api_key, api_url, metadata")
        .eq("id", instanceId)
        .single();

      if (!instance?.api_key) return null;

      const metadata = (instance.metadata as Record<string, any>) || {};
      const uazapiUrl = instance.api_url || metadata.uazapi_url;
      if (!uazapiUrl) return null;

      const cleanPhone = phone.replace(/\D/g, "");

      const response = await fetch(`${uazapiUrl}/chat/details`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: instance.api_key,
        },
        body: JSON.stringify({
          number: cleanPhone,
          preview: true,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      const whatsappPhotoUrl = data.image || data.imagePreview || null;
      const name =
        data.name || data.wa_name || data.lead_fullName || data.lead_name || null;

      if (whatsappPhotoUrl) {
        // Upload to Supabase Storage for permanent URL
        const permanentUrl = await uploadPhotoToStorage(whatsappPhotoUrl, leadId);

        const finalUrl = permanentUrl || whatsappPhotoUrl;
        const updates: Record<string, string> = { photo_url: finalUrl };
        if (name) updates.name = name;

        await supabase.from("leads").update(updates).eq("id", leadId);

        // Invalidate inbox conversations to pick up the new photo
        queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });

        return { name, photo_url: finalUrl };
      }

      return { name, photo_url: null };
    },
    enabled: needsFetch,
    staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours (photos are permanent now)
    retry: false,
  });
};
