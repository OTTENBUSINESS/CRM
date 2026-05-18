import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface DealContact {
  id: string;
  deal_id: string;
  lead_id: string;
  role: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lead?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company_name: string | null;
  };
}

export const CONTACT_ROLES = [
  { value: "decisor", label: "Decisor" },
  { value: "tecnico", label: "Técnico" },
  { value: "financeiro", label: "Financeiro" },
  { value: "influenciador", label: "Influenciador" },
  { value: "usuario", label: "Usuário Final" },
  { value: "outro", label: "Outro" },
] as const;

// Buscar contatos de um deal
export const useDealContacts = (dealId: string | undefined) => {
  return useQuery({
    queryKey: ["deal-contacts", dealId],
    queryFn: async () => {
      if (!dealId) return [];

      // Buscar contatos do deal
      const { data: contacts, error: contactsError } = await (supabase
        .from("deal_contacts" as any)
        .select("*")
        .eq("deal_id", dealId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true }) as any);

      if (contactsError) throw contactsError;
      if (!contacts || contacts.length === 0) return [];

      // Buscar dados dos leads
      const leadIds = contacts.map((c: any) => c.lead_id);
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, name, email, phone, company_name")
        .in("id", leadIds);

      if (leadsError) throw leadsError;

      // Combinar dados
      const leadsMap = new Map(leads?.map((l) => [l.id, l]) || []);
      return contacts.map((contact: any) => ({
        ...contact,
        lead: leadsMap.get(contact.lead_id) || null,
      })) as DealContact[];
    },
    enabled: !!dealId,
  });
};

// Buscar deals de um lead (para saber em quais deals esse lead participa)
export const useLeadDeals = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ["lead-deal-contacts", leadId],
    queryFn: async () => {
      if (!leadId) return [];

      // Buscar participações
      const { data: participations, error: partError } = await (supabase
        .from("deal_contacts" as any)
        .select("*")
        .eq("lead_id", leadId) as any);

      if (partError) throw partError;
      if (!participations || participations.length === 0) return [];

      // Buscar dados dos deals
      const dealIds = participations.map((p: any) => p.deal_id);
      const { data: deals, error: dealsError } = await (supabase
        .from("deals" as any)
        .select("id, title, negotiated_price, status, pipeline_stage_id")
        .in("id", dealIds) as any);

      if (dealsError) throw dealsError;

      // Buscar estágios do pipeline
      const stageIds = deals?.map((d: any) => d.pipeline_stage_id).filter(Boolean) || [];
      let stagesMap = new Map();
      if (stageIds.length > 0) {
        const { data: stages } = await supabase
          .from("sales_pipeline_stages")
          .select("id, name")
          .in("id", stageIds);
        stagesMap = new Map(stages?.map((s) => [s.id, s]) || []);
      }

      // Combinar dados
      const dealsMap = new Map(deals?.map((d: any) => [d.id, {
        ...d,
        pipeline_stage: stagesMap.get(d.pipeline_stage_id) || null,
      }]) || []);

      return participations.map((p: any) => ({
        ...p,
        deal: dealsMap.get(p.deal_id) || null,
      }));
    },
    enabled: !!leadId,
  });
};

// Buscar contatos vinculados a este lead via deal_contacts (outros contatos dos mesmos deals)
export interface LinkedContact {
  lead_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  role: string | null;
  is_primary: boolean;
  deal_id: string | null;
  deal_title: string | null;
  deal_contact_id?: string | null;
  source?: 'deal' | 'partner';
}

export interface LinkedLeadData {
  primaryLead: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    company_name: string | null;
    monthly_revenue: string | null;
    employee_count: number | null;
    challenges: string | null;
    sales_score: number | null;
    sales_stage: string | null;
    bant_budget: string | null;
    bant_authority: string | null;
    bant_need: string | null;
    bant_timeline: string | null;
    ai_conversation_insights: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
  } | null;
  linkedContacts: LinkedContact[];
  deals: Array<{ id: string; title: string; negotiated_price: number; status: string }>;
}

export const useLinkedContacts = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ["linked-contacts", leadId],
    queryFn: async (): Promise<LinkedLeadData> => {
      if (!leadId) return { primaryLead: null, linkedContacts: [], deals: [] };

      // 0. Buscar leads vinculados via partner_lead_id (criados pelo "Novo Lead Vinculado")
      const { data: partnerLeads } = await supabase
        .from("leads")
        .select("id, name, phone, email, company_name, context")
        .eq("partner_lead_id", leadId);

      // Também verificar se ESTE lead é partner de outro (buscar o lead pai)
      const { data: thisLead } = await supabase
        .from("leads")
        .select("partner_lead_id")
        .eq("id", leadId)
        .single();

      let parentLead: any = null;
      if (thisLead?.partner_lead_id) {
        const { data } = await supabase
          .from("leads")
          .select("id, name, phone, email, company_name, context")
          .eq("id", thisLead.partner_lead_id)
          .single();
        parentLead = data;
      }

      // Converter partner leads para LinkedContact format
      const partnerContacts: LinkedContact[] = [
        ...(partnerLeads || []).map((pl: any) => {
          // Extrair tipo de relacionamento do context (ex: "Sócio(a) de: ...")
          const contextMatch = pl.context?.match(/^([^:]+)\s+de:/);
          const role = contextMatch ? contextMatch[1].trim() : 'Associado';
          return {
            lead_id: pl.id,
            name: pl.name,
            phone: pl.phone,
            email: pl.email,
            company_name: pl.company_name,
            role,
            is_primary: false,
            deal_id: null,
            deal_title: null,
            deal_contact_id: null,
            source: 'partner' as const,
          };
        }),
        ...(parentLead ? [{
          lead_id: parentLead.id,
          name: parentLead.name,
          phone: parentLead.phone,
          email: parentLead.email,
          company_name: parentLead.company_name,
          role: 'Lead Principal',
          is_primary: true,
          deal_id: null,
          deal_title: null,
          deal_contact_id: null,
          source: 'partner' as const,
        }] : []),
      ];

      // 1. Buscar deals que esse lead participa
      const { data: myParticipations } = await (supabase
        .from("deal_contacts" as any)
        .select("deal_id, role, is_primary")
        .eq("lead_id", leadId) as any);

      if (!myParticipations || myParticipations.length === 0) {
        // Também checar se é lead principal de um deal (deals.lead_id)
        const { data: ownedDeals } = await (supabase
          .from("deals" as any)
          .select("id, title, negotiated_price, status")
          .eq("lead_id", leadId)
          .neq("status", "lost") as any);

        if (!ownedDeals || ownedDeals.length === 0) {
          if (partnerContacts.length > 0) {
            return { primaryLead: null, linkedContacts: partnerContacts, deals: [] };
          }
          return { primaryLead: null, linkedContacts: [], deals: [] };
        }

        // Buscar outros contatos desses deals
        const dealIds = ownedDeals.map((d: any) => d.id);
        const { data: otherContacts } = await (supabase
          .from("deal_contacts" as any)
          .select("*")
          .in("deal_id", dealIds)
          .neq("lead_id", leadId) as any);

        if (!otherContacts || otherContacts.length === 0) {
          return { primaryLead: null, linkedContacts: partnerContacts, deals: ownedDeals };
        }

        const otherLeadIds = [...new Set(otherContacts.map((c: any) => c.lead_id))];
        const { data: otherLeads } = await supabase
          .from("leads")
          .select("id, name, phone, email, company_name")
          .in("id", otherLeadIds);

        const leadsMap = new Map(otherLeads?.map((l) => [l.id, l]) || []);
        const dealsMap = new Map(ownedDeals.map((d: any) => [d.id, d]));

        const linked = otherContacts.map((c: any) => ({
          lead_id: c.lead_id,
          name: leadsMap.get(c.lead_id)?.name || "?",
          phone: leadsMap.get(c.lead_id)?.phone || null,
          email: leadsMap.get(c.lead_id)?.email || null,
          company_name: leadsMap.get(c.lead_id)?.company_name || null,
          role: c.role,
          is_primary: c.is_primary,
          deal_id: c.deal_id,
          deal_title: dealsMap.get(c.deal_id)?.title || "Deal",
          deal_contact_id: c.id,
          source: 'deal' as const,
        }));

        // Merge partner + deal contacts, deduplicando por lead_id
        const allLinked = [...partnerContacts];
        const existingIds = new Set(allLinked.map(c => c.lead_id));
        for (const c of linked) {
          if (!existingIds.has(c.lead_id)) {
            allLinked.push(c);
            existingIds.add(c.lead_id);
          }
        }

        return { primaryLead: null, linkedContacts: allLinked, deals: ownedDeals };
      }

      // 2. Buscar deals
      const dealIds = myParticipations.map((p: any) => p.deal_id);
      const { data: deals } = await (supabase
        .from("deals" as any)
        .select("id, title, negotiated_price, status, lead_id")
        .in("id", dealIds) as any);

      if (!deals || deals.length === 0) {
        return { primaryLead: null, linkedContacts: [], deals: [] };
      }

      // 3. Buscar TODOS os contatos desses deals (incluindo o primário)
      const { data: allContacts } = await (supabase
        .from("deal_contacts" as any)
        .select("*")
        .in("deal_id", dealIds) as any);

      // 4. Encontrar o lead principal (is_primary ou deals.lead_id)
      const primaryContactEntry = allContacts?.find((c: any) => c.is_primary) || null;
      const primaryLeadId = primaryContactEntry?.lead_id || deals[0]?.lead_id;

      // 5. Buscar dados completos do lead principal (qualificação, BANT, etc.)
      let primaryLead = null;
      if (primaryLeadId && primaryLeadId !== leadId) {
        const { data } = await supabase
          .from("leads")
          .select("id, name, phone, email, company_name, monthly_revenue, employee_count, challenges, sales_score, sales_stage, bant_budget, bant_authority, bant_need, bant_timeline, ai_conversation_insights, utm_source, utm_medium, utm_campaign")
          .eq("id", primaryLeadId)
          .single();
        primaryLead = data;
      }

      // 6. Buscar dados dos outros leads
      const otherContacts = (allContacts || []).filter((c: any) => c.lead_id !== leadId);
      const otherLeadIds = [...new Set(otherContacts.map((c: any) => c.lead_id))];
      let leadsMap = new Map();
      if (otherLeadIds.length > 0) {
        const { data: otherLeads } = await supabase
          .from("leads")
          .select("id, name, phone, email, company_name")
          .in("id", otherLeadIds);
        leadsMap = new Map(otherLeads?.map((l) => [l.id, l]) || []);
      }

      const dealsMap = new Map(deals.map((d: any) => [d.id, d]));
      const linked: LinkedContact[] = otherContacts.map((c: any) => ({
        lead_id: c.lead_id,
        name: leadsMap.get(c.lead_id)?.name || "?",
        phone: leadsMap.get(c.lead_id)?.phone || null,
        email: leadsMap.get(c.lead_id)?.email || null,
        company_name: leadsMap.get(c.lead_id)?.company_name || null,
        role: c.role,
        is_primary: c.is_primary,
        deal_id: c.deal_id,
        deal_title: dealsMap.get(c.deal_id)?.title || "Deal",
        deal_contact_id: c.id,
        source: 'deal' as const,
      }));

      // Merge partner contacts + deal contacts, deduplicando
      const allLinked = [...partnerContacts];
      const existingIds = new Set(allLinked.map(c => c.lead_id));
      for (const c of linked) {
        if (!existingIds.has(c.lead_id)) {
          allLinked.push(c);
          existingIds.add(c.lead_id);
        }
      }

      return {
        primaryLead,
        linkedContacts: allLinked,
        deals: deals.map((d: any) => ({ id: d.id, title: d.title, negotiated_price: d.negotiated_price, status: d.status })),
      };
    },
    enabled: !!leadId,
  });
};

// Adicionar contato ao deal
export const useAddDealContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dealId,
      leadId,
      role,
      isPrimary = false,
      notes,
    }: {
      dealId: string;
      leadId: string;
      role?: string;
      isPrimary?: boolean;
      notes?: string;
    }) => {
      const { data, error } = await (supabase
        .from("deal_contacts" as any)
        .insert({
          deal_id: dealId,
          lead_id: leadId,
          role,
          is_primary: isPrimary,
          notes,
        })
        .select("*")
        .single() as any);

      if (error) throw error;

      // Buscar dados do lead
      const { data: lead } = await supabase
        .from("leads")
        .select("id, name, email, phone, company_name")
        .eq("id", leadId)
        .single();

      return { ...data, lead } as DealContact;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["deal-contacts", variables.dealId] });
      queryClient.invalidateQueries({ queryKey: ["lead-deal-contacts", variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
    },
  });
};

// Atualizar contato do deal
export const useUpdateDealContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      role,
      isPrimary,
      notes,
    }: {
      id: string;
      role?: string;
      isPrimary?: boolean;
      notes?: string;
    }) => {
      const updates: any = { updated_at: new Date().toISOString() };
      if (role !== undefined) updates.role = role;
      if (isPrimary !== undefined) updates.is_primary = isPrimary;
      if (notes !== undefined) updates.notes = notes;

      const { data, error } = await (supabase
        .from("deal_contacts" as any)
        .update(updates)
        .eq("id", id)
        .select()
        .single() as any);

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["deal-contacts", data.deal_id] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
    },
  });
};

// Remover contato do deal
export const useRemoveDealContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dealId }: { id: string; dealId: string }) => {
      const { error } = await (supabase
        .from("deal_contacts" as any)
        .delete()
        .eq("id", id) as any);

      if (error) throw error;
      return { id, dealId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["deal-contacts", variables.dealId] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
    },
  });
};

// Desvincular contato (deal_contact ou partner_lead_id)
export const useUnlinkContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: LinkedContact & { currentLeadId: string }) => {
      if (contact.source === 'partner') {
        // Desvincular partner: limpar partner_lead_id do lead filho
        const { error } = await supabase
          .from('leads')
          .update({ partner_lead_id: null, context: null })
          .eq('id', contact.lead_id);
        if (error) throw error;
      } else if (contact.deal_contact_id) {
        // Remover do deal_contacts
        const { error } = await (supabase
          .from("deal_contacts" as any)
          .delete()
          .eq("id", contact.deal_contact_id) as any);
        if (error) throw error;
      }
      return contact;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["linked-contacts", variables.currentLeadId] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
      if (variables.deal_id) {
        queryClient.invalidateQueries({ queryKey: ["deal-contacts", variables.deal_id] });
      }
    },
  });
};

// Definir contato como primário (remove primário dos outros)
export const useSetPrimaryContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dealId }: { id: string; dealId: string }) => {
      // Remove is_primary de todos
      await (supabase
        .from("deal_contacts" as any)
        .update({ is_primary: false })
        .eq("deal_id", dealId) as any);

      // Define o novo como primário
      const { data, error } = await (supabase
        .from("deal_contacts" as any)
        .update({ is_primary: true })
        .eq("id", id)
        .select()
        .single() as any);

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["deal-contacts", variables.dealId] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
    },
  });
};
