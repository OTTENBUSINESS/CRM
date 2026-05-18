import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

// ============================================
// Types
// ============================================
interface LeadDuplicate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  sales_stage: string | null;
  etapa_funil: string | null;
  sales_score: number;
  company_name: string | null;
  created_at: string;
  // Counts for display
  deals_count?: number;
  messages_count?: number;
  calls_count?: number;
  meetings_count?: number;
}

interface LeadConversion {
  id: string;
  lead_id: string;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_page: string | null;
  referrer: string | null;
  created_at: string;
}

interface MergeResult {
  success: boolean;
  primary_id: string;
  secondary_id: string;
  merged_counts: {
    deals: number;
    whatsapp_messages: number;
    call_history: number;
    meetings: number;
    transactions: number;
    conversions: number;
  };
}

// ============================================
// useLinkedOrganizations - orgs where lead is primary_contact
// ============================================
export function useLinkedOrganizations(leadId: string | undefined) {
  return useQuery({
    queryKey: ["linked-organizations", leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, status")
        .eq("primary_contact_id", leadId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!leadId,
  });
}

// ============================================
// useMergeLeads - mutation to merge two leads
// ============================================
export function useMergeLeads() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      primaryId,
      secondaryId,
    }: {
      primaryId: string;
      secondaryId: string;
    }) => {
      const { data, error } = await supabase.rpc("merge_leads", {
        p_keeper_id: primaryId,
        p_duplicate_id: secondaryId,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: (data) => {
      toast({
        title: "Leads mesclados!",
        description: data || "Dados unificados com sucesso.",
      });
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["sales-leads"] });
      queryClient.invalidateQueries({ queryKey: ["sales-lead"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
      queryClient.invalidateQueries({ queryKey: ["contact-deals"] });
      queryClient.invalidateQueries({ queryKey: ["hot-leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-deals"] });
      queryClient.invalidateQueries({ queryKey: ["lead-conversions"] });
      queryClient.invalidateQueries({ queryKey: ["lead-duplicates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao mesclar leads",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// ============================================
// useLeadDuplicates - find leads with same phone/email
// ============================================
export function useLeadDuplicates(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-duplicates", leadId],
    queryFn: async () => {
      if (!leadId) return [];

      // First get the current lead's phone and email
      const { data: currentLead, error: leadError } = await supabase
        .from("leads")
        .select("id, phone, email, instagram")
        .eq("id", leadId)
        .single();

      if (leadError || !currentLead) return [];

      const conditions: string[] = [];
      if (currentLead.phone) {
        // Match on last 8 digits
        const last8 = currentLead.phone.replace(/\D/g, "").slice(-8);
        if (last8.length >= 8) {
          conditions.push(`phone.like.%${last8}%`);
        }
      }
      if (currentLead.email) {
        conditions.push(`email.ilike.${currentLead.email}`);
      }

      if (conditions.length === 0) return [];

      const { data, error } = await supabase
        .from("leads")
        .select("id, name, email, phone, instagram, sales_stage, etapa_funil, sales_score, company_name, created_at, messages_count")
        .or(conditions.join(","))
        .neq("id", leadId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      // Enrich with counts
      const enriched = await Promise.all(
        (data || []).map(async (lead) => {
          const [dealsRes, callsRes, meetingsRes] = await Promise.all([
            supabase.from("deals").select("id", { count: "exact", head: true }).eq("lead_id", lead.id),
            supabase.from("call_history").select("id", { count: "exact", head: true }).eq("lead_id", lead.id),
            supabase.from("meetings").select("id", { count: "exact", head: true }).eq("lead_id", lead.id),
          ]);

          return {
            ...lead,
            deals_count: dealsRes.count || 0,
            messages_count: lead.messages_count || 0,
            calls_count: callsRes.count || 0,
            meetings_count: meetingsRes.count || 0,
          } as LeadDuplicate;
        })
      );

      return enriched;
    },
    enabled: !!leadId,
    staleTime: 30000,
  });
}

// ============================================
// useSearchLeadsForMerge - manual search for merge candidates
// ============================================
export function useSearchLeadsForMerge(query: string, excludeId?: string) {
  return useQuery({
    queryKey: ["merge-lead-search", query, excludeId],
    queryFn: async () => {
      if (query.length < 2) return [];

      const cleanPhone = query.replace(/\D/g, "");
      const isPhone = cleanPhone.length >= 8;
      const isEmail = query.includes("@");

      let dbQuery = supabase
        .from("leads")
        .select("id, name, email, phone, instagram, sales_stage, etapa_funil, sales_score, company_name, created_at, messages_count");

      if (isEmail) {
        dbQuery = dbQuery.ilike("email", `%${query}%`);
      } else if (isPhone) {
        const last8 = cleanPhone.slice(-8);
        dbQuery = dbQuery.like("phone", `%${last8}%`);
      } else {
        dbQuery = dbQuery.or(`name.ilike.%${query}%,instagram.ilike.%${query}%`);
      }

      if (excludeId) {
        dbQuery = dbQuery.neq("id", excludeId);
      }

      const { data, error } = await dbQuery
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as LeadDuplicate[];
    },
    enabled: query.length >= 2,
    staleTime: 500,
  });
}

// ============================================
// useLeadConversions - list conversions for a lead
// ============================================
export function useLeadConversions(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-conversions", leadId],
    queryFn: async () => {
      if (!leadId) return [];

      const { data, error } = await supabase
        .from("lead_conversions")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as LeadConversion[];
    },
    enabled: !!leadId,
  });
}

// ============================================
// useCheckLeadDuplicate - check before creating a new lead
// ============================================
export function useCheckLeadDuplicate() {
  return useMutation({
    mutationFn: async ({ phone, email }: { phone?: string; email?: string }) => {
      const conditions: string[] = [];

      if (phone) {
        const cleanPhone = phone.replace(/\D/g, "");
        const last8 = cleanPhone.slice(-8);
        if (last8.length >= 8) {
          conditions.push(`phone.like.%${last8}%`);
        }
      }

      if (email) {
        conditions.push(`email.ilike.${email}`);
      }

      if (conditions.length === 0) return [];

      const { data, error } = await supabase
        .from("leads")
        .select("id, name, phone, email, sales_stage, created_at")
        .or(conditions.join(","))
        .limit(5);

      if (error) throw error;
      return data || [];
    },
  });
}

// ============================================
// useRegisterConversion - register a new conversion for existing lead
// ============================================
export function useRegisterConversion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      leadId,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
    }: {
      leadId: string;
      source?: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      utm_content?: string;
      utm_term?: string;
    }) => {
      const { data, error } = await supabase
        .from("lead_conversions")
        .insert({
          lead_id: leadId,
          source: source || utm_source || null,
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: utm_term || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Conversão registrada!",
        description: "Nova entrada registrada para o lead existente.",
      });
      queryClient.invalidateQueries({ queryKey: ["lead-conversions"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao registrar conversão",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
