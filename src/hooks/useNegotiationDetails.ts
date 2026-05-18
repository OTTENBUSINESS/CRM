import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NegotiationDetails {
  id: string;
  deal_id: string;
  entrada_completa: boolean;
  valor_faltante: number;
  garantia_cdc: boolean;
  garantia_cdc_inicio: string | null;
  tempo_acesso_meses: number;
  bonus_saas: boolean;
  observacoes_cs: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch negotiation details for a lead (via their won deals)
 */
export function useNegotiationDetailsByLead(leadId: string | undefined | null) {
  return useQuery({
    queryKey: ["negotiation-details", "lead", leadId],
    queryFn: async () => {
      if (!leadId) return null;

      // Get won deals for this lead
      const { data: deals, error: dealsError } = await supabase
        .from("deals")
        .select("id")
        .eq("lead_id", leadId)
        .eq("status", "won")
        .order("won_at", { ascending: false })
        .limit(1);

      if (dealsError || !deals || deals.length === 0) return null;

      const dealId = deals[0].id;

      const { data, error } = await supabase
        .from("deal_negotiation_details")
        .select("*")
        .eq("deal_id", dealId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching negotiation details:", error);
        return null;
      }

      return data as NegotiationDetails | null;
    },
    enabled: !!leadId,
  });
}

/**
 * Fetch negotiation details directly by deal ID
 */
export function useNegotiationDetails(dealId: string | undefined | null) {
  return useQuery({
    queryKey: ["negotiation-details", "deal", dealId],
    queryFn: async () => {
      if (!dealId) return null;

      const { data, error } = await supabase
        .from("deal_negotiation_details")
        .select("*")
        .eq("deal_id", dealId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching negotiation details:", error);
        return null;
      }

      return data as NegotiationDetails | null;
    },
    enabled: !!dealId,
  });
}
