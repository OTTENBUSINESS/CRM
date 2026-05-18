import { supabase } from "@/lib/supabase";

interface MeetingExtraction {
  found: boolean;
  datetime?: string;
  title?: string;
}

export async function extractMeetingDateTime(
  messages: Array<{ content: string; is_from_me: boolean; sent_at: string }>,
  leadName: string
): Promise<MeetingExtraction> {
  try {
    const { data, error } = await supabase.functions.invoke("extract-meeting-datetime", {
      body: { messages, lead_name: leadName },
    });

    if (error) {
      console.error("Error extracting meeting datetime:", error);
      return { found: false };
    }

    return data as MeetingExtraction;
  } catch (err) {
    console.error("Error extracting meeting datetime:", err);
    return { found: false };
  }
}
