import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { convertTransactionAmount } from './useTransactions';

export interface TimelineEvent {
  id: string;
  date: string;
  time: string;
  type: 'lead' | 'visit' | 'checkout' | 'purchase' | 'payment' | 'registration' | 'onboarding' | 'access' | 'lesson' | 'whatsapp' | 'support' | 'instagram' | 'touchpoint' | 'note' | 'call' | 'meeting' | 'event_rsvp' | 'nfse' | 'billing' | 'churn' | 'palestra' | 'testimonial';
  team: 'sales' | 'cs';
  title: string;
  description: string;
  details?: string;
  amount?: number;
  tags?: string[];
  metadata?: any;
}

export const useClientTimeline = (leadId: string | undefined, organizationId: string | undefined) => {
  return useQuery({
    queryKey: ['client-timeline', leadId, organizationId],
    queryFn: async () => {
      if (!leadId) return [];

      const events: TimelineEvent[] = [];

      // Resolver organization_id do lead (para buscar meetings vinculadas à org)
      let resolvedOrgId = organizationId || null;
      if (!resolvedOrgId && leadId) {
        const { data: orgForLead } = await (supabase
          .from('organizations' as any)
          .select('id')
          .eq('primary_contact_id', leadId)
          .maybeSingle() as any);
        resolvedOrgId = orgForLead?.id || null;
      }

      // 1. Lead data (criação, checkout, etc)
      const { data: lead, error: leadError } = await (supabase
        .from('leads' as any)
        .select('*')
        .eq('id', leadId)
        .single() as any);

      if (leadError) {
        console.error('Erro ao buscar lead para timeline:', leadError);
      }

      if (lead) {
        // Lead criado
        if (lead.created_at) {
          const landingPagePath = lead.landing_page ? (() => {
            try { return new URL(lead.landing_page).pathname; } catch { return lead.landing_page; }
          })() : null;
          
          // Montar detalhes com todas as informações disponíveis
          const detailsParts = [];
          if (lead.email) detailsParts.push(`📧 ${lead.email}`);
          if (lead.phone) detailsParts.push(`📱 ${lead.phone}`);
          if (lead.instagram) detailsParts.push(`📸 @${lead.instagram}`);
          if (landingPagePath) detailsParts.push(`🌐 ${landingPagePath}`);
          
          // Indicador de prints/anexos
          const hasAttachments = lead.attachments && lead.attachments.length > 0;
          if (hasAttachments) {
            detailsParts.push(`📎 ${lead.attachments.length} print(s)`);
          }
          
          // Tags para indicar prints
          const tags = hasAttachments ? ['📎 Com Prints'] : undefined;
          
          events.push({
            id: `lead-created-${lead.id}`,
            date: lead.created_at,
            time: new Date(lead.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'lead',
            team: 'sales',
            title: 'Lead Criado',
            description: [
              `${lead.name || 'Novo lead'} capturado via ${lead.utm_source || 'direto'}`,
              lead.utm_medium ? `meio: ${lead.utm_medium}` : '',
              lead.utm_campaign ? `campanha: ${lead.utm_campaign}` : '',
              lead.utm_content ? `conteúdo: ${lead.utm_content}` : '',
              lead.utm_term ? `termo: ${lead.utm_term}` : '',
            ].filter(Boolean).join(' · '),
            details: detailsParts.join(' • '),
            tags,
            metadata: {
              utm_source: lead.utm_source,
              utm_medium: lead.utm_medium,
              utm_campaign: lead.utm_campaign,
              utm_content: lead.utm_content,
              utm_term: lead.utm_term,
              lead,
              context: lead.context,
              attachments: lead.attachments,
            }
          });
        }

        // Estágio de vendas — REMOVIDO: agora usamos deals como fonte de verdade.
        // Movimentações de estágio são registradas em company_activities (task_type=stage_change)

        // Checkout visitado
        if (lead.checkout_visited_at) {
          events.push({
            id: `checkout-${lead.id}`,
            date: lead.checkout_visited_at,
            time: new Date(lead.checkout_visited_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'checkout',
            team: 'sales',
            title: 'Visitou Checkout',
            description: 'Cliente visitou página de checkout mas não finalizou.',
            details: `Produto: ${lead.plan_name || 'N/A'}`,
            tags: ['Oportunidade']
          });
        }

        // PIX gerado
        if (lead.pix_generated_at) {
          events.push({
            id: `pix-${lead.id}`,
            date: lead.pix_generated_at,
            time: new Date(lead.pix_generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'payment',
            team: 'sales',
            title: 'PIX Gerado',
            description: 'Cliente gerou PIX para pagamento.',
            details: `Valor: R$ ${parseFloat(lead.trans_value || 0) / 100}`
          });
        }
      }

      // 2. Lead interactions (visitas) - AGRUPADAS POR DIA
      const { data: interactions } = await (supabase
        .from('lead_interactions' as any)
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }) as any);

      // Agrupar visitas por dia
      const visitsByDay = new Map<string, any[]>();
      (interactions || []).forEach((i: any) => {
        if (i.interaction_type === 'visit') {
          const day = new Date(i.created_at).toISOString().split('T')[0];
          if (!visitsByDay.has(day)) {
            visitsByDay.set(day, []);
          }
          visitsByDay.get(day)!.push(i);
        }
      });

      visitsByDay.forEach((dayVisits, day) => {
        const firstVisit = dayVisits[dayVisits.length - 1]; // mais antiga do dia
        const landingPage = lead?.landing_page ? new URL(lead.landing_page).pathname : '/';
        
        events.push({
          id: `visits-${day}`,
          date: firstVisit.created_at,
          time: new Date(firstVisit.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: 'visit',
          team: 'sales',
          title: dayVisits.length > 1 ? `Visitou Landing Page (${dayVisits.length}x)` : 'Visitou Landing Page',
          description: `Cliente acessou ${landingPage}`,
          details: `${dayVisits.length} visita(s) • ${lead?.landing_page || 'Página de captura'}`,
          metadata: { visits: dayVisits }
        });
      });

      // 3. Transactions (compras e pagamentos)
      const { data: transactions } = await (supabase
        .from('transactions' as any)
        .select('*')
        .eq('lead_id', leadId)
        .order('transaction_date', { ascending: false }) as any);

      // Filtrar transações que NÃO estão vinculadas a deals (evita duplicação com deal_payments)
      const externalTransactions = (transactions || []).filter((tx: any) => !tx.deal_payment_id && !tx.deal_id);

      externalTransactions.forEach((tx: any) => {
        const amount = convertTransactionAmount(tx.amount, tx.payment_method, tx.payment_platform);
        const isPurchase = amount > 500;

        events.push({
          id: `tx-${tx.id}`,
          date: tx.transaction_date,
          time: '-',
          type: isPurchase ? 'purchase' : 'payment',
          team: 'sales',
          title: isPurchase ? `Nova Compra: ${tx.product_name}` : 'Pagamento Recebido',
          description: isPurchase 
            ? `Cliente adquiriu ${tx.product_name}.`
            : `Parcela de ${tx.product_name} processada com sucesso.`,
          details: `R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • ${tx.payment_method === 'CREDIT_CARD' || tx.payment_method === 'credit_card' ? 'Cartão' : tx.payment_method === 'bank_slip' ? 'Boleto' : tx.payment_method} • ${tx.payment_platform}`,
          amount,
          tags: tx.status === 'approved' || tx.status === 'RECEIVED' ? ['Aprovado'] : undefined
        });
      });

      // 3.5 Deals (negociações)
      const WEBINAR_PIPELINE_ID = '90b09d81-8282-4503-a869-1787baf8f736';
      const { data: deals } = await (supabase
        .from('deals' as any)
        .select('*, metadata, pipeline_id, product:products(name), pipeline_stage:sales_pipeline_stages(name), sales_rep:team_members!deals_sales_rep_id_fkey(name)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }) as any);

      (deals || []).forEach((deal: any) => {
        const dealValue = Number(deal.negotiated_price) || 0;
        const stageName = deal.pipeline_stage?.name || 'Em Negociação';
        const isWebinarPipeline = deal.pipeline_id === WEBINAR_PIPELINE_ID;

        // Deal criado — pula se for pipeline Webinario (ja tem evento de inscricao)
        if (!isWebinarPipeline) {
          events.push({
            id: `deal-created-${deal.id}`,
            date: deal.created_at,
            time: new Date(deal.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'checkout',
            team: 'sales',
            title: `💼 Nova Negociação: ${deal.product?.name || deal.title || 'Deal'}`,
            description: `Negociação iniciada no valor de R$ ${dealValue.toLocaleString('pt-BR')}.`,
            details: `Estágio: ${stageName} • Produto: ${deal.product?.name || 'N/A'}`,
            amount: dealValue,
            tags: ['Oportunidade'],
            metadata: { deal_id: deal.id }
          });
        }

        // Deal fechado (won) — mostra mesmo se deal depois virou lost (churn/reembolso)
        if (deal.won_at) {
          const repName = deal.sales_rep?.name || 'vendedor';
          const productName = deal.product?.name || deal.title || 'Deal';
          const negotiationDetails = deal.metadata?.negotiation_details || deal.negotiation_details;
          const detailParts = [`Valor: R$ ${dealValue.toLocaleString('pt-BR')}`];
          detailParts.push(`Responsável: ${repName}`);
          if (deal.discount_reason) detailParts.push(`Justificativa: ${deal.discount_reason}`);
          if (negotiationDetails?.entrada_completa === false) detailParts.push(`⚠️ Entrada parcial`);
          if (negotiationDetails?.garantia_cdc) detailParts.push(`⚠️ CDC 7 dias`);
          if (negotiationDetails?.tempo_acesso_meses) detailParts.push(`Acesso: ${negotiationDetails.tempo_acesso_meses} meses`);
          if (negotiationDetails?.observacoes_cs) detailParts.push(`CS: ${negotiationDetails.observacoes_cs}`);

          events.push({
            id: `deal-won-${deal.id}`,
            date: deal.won_at,
            time: new Date(deal.won_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'purchase',
            team: 'sales',
            title: `🎉 Deal Fechado: ${productName}`,
            description: `Fechado por ${repName} — R$ ${dealValue.toLocaleString('pt-BR')}`,
            details: detailParts.join(' • '),
            amount: dealValue,
            tags: ['Convertido', productName],
            metadata: { deal_id: deal.id, sales_rep: repName, negotiation_details: negotiationDetails }
          });
        }

        // Deal perdido — pula se motivo é Churn/Reembolso (já tem evento de churn/refund da company_activities)
        if (deal.status === 'lost' && deal.lost_at) {
          const lostReason = deal.lost_reason || '';
          const isChurnOrRefund = lostReason.startsWith('Churn:') || lostReason.startsWith('Reembolso:');
          if (!isChurnOrRefund) {
            const repName = deal.sales_rep?.name || 'vendedor';
            events.push({
              id: `deal-lost-${deal.id}`,
              date: deal.lost_at,
              time: new Date(deal.lost_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              type: 'lead',
              team: 'sales',
              title: `❌ Deal Perdido: ${deal.product?.name || deal.title || 'Deal'}`,
              description: `Perdido por ${repName}. Motivo: ${lostReason || 'Não informado'}`,
              details: `Responsável: ${repName} • Motivo: ${lostReason || 'Não informado'}`,
              tags: ['Perdido'],
              metadata: { deal_id: deal.id, sales_rep: repName }
            });
          }
        }

        // Transferências de pipeline (do metadata)
        const transfers = deal.metadata?.transfers;
        if (transfers && Array.isArray(transfers)) {
          transfers.forEach((transfer: any, idx: number) => {
            events.push({
              id: `deal-transfer-${deal.id}-${idx}`,
              date: transfer.transferred_at,
              time: new Date(transfer.transferred_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              type: 'lead' as const,
              team: 'sales',
              title: `🔀 Transferido de Pipeline`,
              description: `${transfer.from_pipeline_name} → ${transfer.to_pipeline_name}`,
              details: `De: ${transfer.from_stage_name} → Para: ${transfer.to_stage_name}${transfer.transferred_by_name ? ` • Por: ${transfer.transferred_by_name}` : ''}`,
              tags: ['Transferência', transfer.to_pipeline_name],
              metadata: { deal_id: deal.id, transfer }
            });
          });
        }
      });

      // 3.7 Webinar enrollments (inscricoes em webinarios — fonte canonica)
      const { data: webinarEnrollments } = await (supabase
        .from('lead_webinar_enrollments' as any)
        .select('id, enrolled_at, webinar_config_id, deal_id, source, metadata, webinar_config:webinar_config(id, title, event_date)')
        .eq('lead_id', leadId)
        .order('enrolled_at', { ascending: false }) as any);

      (webinarEnrollments || []).forEach((enr: any) => {
        const wTitle = enr.webinar_config?.title || 'Webinario';
        events.push({
          id: `webinar-enroll-${enr.id}`,
          date: enr.enrolled_at,
          time: new Date(enr.enrolled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: 'registration',
          team: 'sales',
          title: `🎯 Inscrito no Webinario: ${wTitle}`,
          description: `Lead se inscreveu no webinario "${wTitle}".`,
          details: enr.source ? `Origem: ${enr.source}` : undefined,
          tags: ['Webinario', wTitle],
          metadata: {
            enrollment_id: enr.id,
            webinar_config_id: enr.webinar_config_id,
            webinar_title: wTitle,
            deal_id: enr.deal_id,
          }
        });
      });

      // 4. Event registrations — atendencia ao webinario (so renderiza apos data do evento)
      const { data: eventRegs } = await (supabase
        .from('event_registrations' as any)
        .select('*, event:events(*)')
        .eq('lead_id', leadId) as any);

      (eventRegs || []).forEach((reg: any) => {
        const eventName = reg.event?.name || 'Evento';
        const eventDate = reg.event?.start_date || reg.event?.event_date || null;
        const eventHasHappened = eventDate ? new Date(eventDate) <= new Date() : false;

        // Antes do evento acontecer: nao renderiza atendencia (ja tem evento de inscricao)
        if (!eventHasHappened) return;

        // Apos o evento: renderiza atendencia
        const tags: string[] = [];
        let title = '';
        let description = '';

        if (reg.attended) {
          tags.push('Participou');
          if (reg.total_duration_minutes) {
            const hours = Math.floor(reg.total_duration_minutes / 60);
            const mins = reg.total_duration_minutes % 60;
            const durationStr = hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}min` : ''}` : `${mins} minutos`;
            tags.push(durationStr);
            description = `Participou por ${durationStr}.`;
            if (reg.total_sessions && reg.total_sessions > 1) {
              description += ` Entrou ${reg.total_sessions}x.`;
            }
          } else {
            description = `Compareceu ao webinario.`;
          }
          title = `📺 Compareceu: ${eventName}`;
        } else {
          tags.push('Faltou');
          title = `🚫 Faltou: ${eventName}`;
          description = `Nao compareceu ao webinario.`;
        }

        // Detalhes adicionais
        const detailsParts: string[] = [];
        if (reg.first_join_time) {
          const joinTime = new Date(reg.first_join_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          detailsParts.push(`Entrou: ${joinTime}`);
        }
        if (reg.last_leave_time) {
          const leaveTime = new Date(reg.last_leave_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          detailsParts.push(`Saiu: ${leaveTime}`);
        }

        events.push({
          id: `event-reg-${reg.id}`,
          // Usa a data do evento (nao da inscricao) pra timeline
          date: eventDate || reg.registration_date,
          time: new Date(eventDate || reg.registration_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: 'registration',
          team: 'sales',
          title,
          description,
          details: detailsParts.join(' • ') || undefined,
          tags: tags.length > 0 ? tags : undefined,
          metadata: {
            attended: reg.attended,
            total_duration_minutes: reg.total_duration_minutes,
            first_join_time: reg.first_join_time,
            last_leave_time: reg.last_leave_time,
            total_sessions: reg.total_sessions,
            qa_questions: reg.qa_questions,
            event_name: eventName,
          }
        });
      });

      // 4.5 Event RSVPs (eventos presenciais - cs_event_rsvps)
      {
        // Buscar por lead_id OU organization_id
        const rsvpFilters = [];
        if (leadId) rsvpFilters.push({ field: 'lead_id', value: leadId });
        if (organizationId) rsvpFilters.push({ field: 'organization_id', value: organizationId });

        const allRsvps: any[] = [];
        for (const filter of rsvpFilters) {
          const { data: rsvps } = await (supabase
            .from('cs_event_rsvps' as any)
            .select('*, event:cs_events(*)')
            .eq(filter.field, filter.value) as any);
          if (rsvps) allRsvps.push(...rsvps);
        }

        // Deduplica por ID caso lead_id e organization_id retornem o mesmo RSVP
        const uniqueRsvps = allRsvps.filter((rsvp, idx, arr) =>
          arr.findIndex((r) => r.id === rsvp.id) === idx
        );

        uniqueRsvps.forEach((rsvp: any) => {
          const eventName = rsvp.event?.name || 'Evento Presencial';
          const eventDate = rsvp.event?.start_date
            ? new Date(rsvp.event.start_date).toLocaleDateString('pt-BR')
            : null;

          // Status label
          const statusLabels: Record<string, string> = {
            confirmed: 'Confirmado',
            declined: 'Recusou',
            maybe: 'Talvez',
            pending: 'Pendente',
          };
          const statusLabel = statusLabels[rsvp.rsvp_status] || rsvp.rsvp_status;

          // Tags
          const tags: string[] = [statusLabel];
          if (rsvp.has_companion && rsvp.companion_name) {
            tags.push(`+1 ${rsvp.companion_name.split(' ')[0]}`);
          }
          if (rsvp.checked_in_at) {
            tags.push('Check-in feito');
          }
          if (rsvp.companion_checked_in) {
            tags.push('Acompanhante check-in');
          }
          if (rsvp.is_client) {
            tags.push('Cliente');
          }

          // Descricao
          let description = '';
          if (rsvp.rsvp_status === 'confirmed') {
            description = `Confirmou presenca no evento ${eventName}.`;
            if (rsvp.checked_in_at) {
              const checkinTime = new Date(rsvp.checked_in_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              description = `Fez check-in as ${checkinTime} no evento ${eventName}.`;
            }
          } else if (rsvp.rsvp_status === 'declined') {
            description = `Recusou convite para ${eventName}.`;
          } else if (rsvp.rsvp_status === 'maybe') {
            description = `Indicou "talvez" para ${eventName}.`;
          } else {
            description = `RSVP pendente para ${eventName}.`;
          }

          // Detalhes
          const detailsParts: string[] = [];
          if (eventDate) detailsParts.push(`Data: ${eventDate}`);
          if (rsvp.event?.location) detailsParts.push(`Local: ${rsvp.event.location}`);
          if (rsvp.has_companion && rsvp.companion_name) {
            detailsParts.push(`Acompanhante: ${rsvp.companion_name}`);
          }
          if (rsvp.dietary_restrictions) detailsParts.push(`Restricao: ${rsvp.dietary_restrictions}`);
          if (rsvp.notes) detailsParts.push(`Obs: ${rsvp.notes}`);
          const sourceLabels: Record<string, string> = {
            public_form: 'Formulario publico',
            manual: 'Manual',
            import: 'Importado',
          };
          detailsParts.push(`Via ${sourceLabels[rsvp.source] || rsvp.source}`);

          // Evento de confirmacao/RSVP
          events.push({
            id: `event-rsvp-${rsvp.id}`,
            date: rsvp.confirmed_at || rsvp.created_at,
            time: new Date(rsvp.confirmed_at || rsvp.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'event_rsvp',
            team: 'sales',
            title: rsvp.rsvp_status === 'confirmed'
              ? `🎟️ Confirmou: ${eventName}`
              : rsvp.rsvp_status === 'declined'
                ? `❌ Recusou: ${eventName}`
                : `🎟️ RSVP: ${eventName}`,
            description,
            details: detailsParts.join(' • '),
            tags,
            metadata: {
              rsvp_id: rsvp.id,
              event_id: rsvp.event_id,
              event: rsvp.event,
              rsvp_status: rsvp.rsvp_status,
              checked_in_at: rsvp.checked_in_at,
              has_companion: rsvp.has_companion,
              companion_name: rsvp.companion_name,
              companion_checked_in: rsvp.companion_checked_in,
              guest_company: rsvp.guest_company,
              dietary_restrictions: rsvp.dietary_restrictions,
              notes: rsvp.notes,
              custom_answers: rsvp.custom_answers,
            }
          });

          // Evento separado de check-in (se fez check-in)
          if (rsvp.checked_in_at) {
            events.push({
              id: `event-checkin-${rsvp.id}`,
              date: rsvp.checked_in_at,
              time: new Date(rsvp.checked_in_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              type: 'event_rsvp',
              team: 'sales',
              title: `✅ Check-in: ${eventName}`,
              description: `Realizou check-in no evento ${eventName}.${rsvp.companion_checked_in ? ` Acompanhante (${rsvp.companion_name}) tambem fez check-in.` : ''}`,
              details: rsvp.event?.location ? `Local: ${rsvp.event.location}` : undefined,
              tags: ['Presente', ...(rsvp.companion_checked_in ? ['Acompanhante presente'] : [])],
              metadata: {
                rsvp_id: rsvp.id,
                event_id: rsvp.event_id,
                checked_in_at: rsvp.checked_in_at,
              }
            });
          }
        });
      }

      // 5. NPS Responses
      const { data: npsResponses } = await (supabase
        .from('nps_responses' as any)
        .select('*, event:cs_events(*)')
        .eq('lead_id', leadId) as any);

      (npsResponses || []).forEach((nps: any) => {
        // Classificar NPS
        let npsCategory = '';
        let npsColor = '';
        if (nps.score >= 9) {
          npsCategory = 'Promotor';
          npsColor = 'bg-emerald-100 text-emerald-700';
        } else if (nps.score >= 7) {
          npsCategory = 'Neutro';
          npsColor = 'bg-amber-100 text-amber-700';
        } else {
          npsCategory = 'Detrator';
          npsColor = 'bg-red-100 text-red-700';
        }

        // Tags
        const tags = [`Nota ${nps.score}`, npsCategory];
        if (nps.days_attended) {
          tags.push(`${nps.days_attended} dia${nps.days_attended > 1 ? 's' : ''}`);
        }

        // Descrição com feedbacks
        let description = `Avaliou com nota ${nps.score}/10.`;
        if (nps.total_minutes) {
          const hours = Math.floor(nps.total_minutes / 60);
          const mins = nps.total_minutes % 60;
          const durationStr = hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}min` : ''}` : `${mins}min`;
          description += ` Assistiu ${durationStr} no total.`;
        }

        // Detalhes com feedbacks
        const detailsParts = [];
        if (nps.liked_most) {
          detailsParts.push(`👍 "${nps.liked_most}"`);
        }
        if (nps.liked_least) {
          detailsParts.push(`👎 "${nps.liked_least}"`);
        }

        events.push({
          id: `nps-${nps.id}`,
          date: nps.created_at,
          time: new Date(nps.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: 'support' as const,
          team: 'cs',
          title: `📊 NPS: ${nps.event?.name || 'Avaliação'}`,
          description,
          details: detailsParts.length > 0 ? detailsParts.join(' • ') : undefined,
          tags,
          metadata: {
            score: nps.score,
            category: npsCategory,
            liked_most: nps.liked_most,
            liked_least: nps.liked_least,
            days_attended: nps.days_attended,
            total_minutes: nps.total_minutes
          }
        });
      });

      // 6. PAIN registrations
      const { data: painRegs } = await (supabase
        .from('pain_registrations' as any)
        .select('*')
        .eq('lead_id', leadId) as any);

      // Mapeamento de payment_option para labels amigáveis
      const paymentOptionLabels: Record<string, string> = {
        '12x': '12x no Cartão',
        'avista': 'À Vista',
        'apenas_interesse': 'Apenas Interesse',
        'taxa_interesse': 'Pagou Taxa de Interesse',
        'duvidas': 'Tem Dúvidas',
      };

      (painRegs || []).forEach((reg: any) => {
        const paymentLabel = paymentOptionLabels[reg.payment_option] || reg.payment_option || 'Não informado';
        const amountPaid = reg.amount_paid ? `R$ ${(reg.amount_paid / 100).toLocaleString('pt-BR')}` : null;
        const amountTotal = reg.amount_total ? `R$ ${(reg.amount_total / 100).toLocaleString('pt-BR')}` : null;
        const amountBalance = reg.amount_balance ? `R$ ${(reg.amount_balance / 100).toLocaleString('pt-BR')}` : null;

        // Construir descrição detalhada
        let description = `💰 Como quer pagar: ${paymentLabel}`;
        if (reg.payment_method) {
          description += ` • Método: ${reg.payment_method}`;
        }
        if (reg.payment_details) {
          description += ` • ${reg.payment_details}`;
        }

        // Construir detalhes adicionais
        const detailsParts = [];
        if (reg.utm_source) detailsParts.push(`Via ${reg.utm_source}`);
        if (reg.utm_campaign) detailsParts.push(`Campanha: ${reg.utm_campaign}`);
        if (reg.assignee) detailsParts.push(`Responsável: ${reg.assignee}`);
        if (amountPaid) detailsParts.push(`Pago: ${amountPaid}`);
        if (amountTotal) detailsParts.push(`Total: ${amountTotal}`);
        if (amountBalance) detailsParts.push(`Saldo: ${amountBalance}`);
        if (reg.payment_platform) detailsParts.push(`Plataforma: ${reg.payment_platform}`);
        if (reg.loss_reason) detailsParts.push(`Motivo perda: ${reg.loss_reason}`);
        if (reg.notes) detailsParts.push(`Obs: ${reg.notes}`);

        // Determinar tags baseado no status e payment_option
        const tags = [];
        if (reg.status === 'pending') tags.push('Oportunidade');
        if (reg.payment_option === 'avista' || reg.payment_option === '12x') tags.push('Quente');
        if (reg.payment_option === 'taxa_interesse') tags.push('Pagou Taxa');
        if (reg.payment_option === 'duvidas') tags.push('Dúvidas');
        if (reg.loss_reason) tags.push('Perdido');

        events.push({
          id: `pain-reg-${reg.id}`,
          date: reg.created_at,
          time: new Date(reg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: 'registration',
          team: 'sales',
          title: `🔥 Interesse PAIN: ${paymentLabel}`,
          description,
          details: detailsParts.join(' • ') || `Status: ${reg.status || 'pending'}`,
          tags: tags.length > 0 ? tags : undefined,
          metadata: { pain_registration: reg }
        });
      });

      // 5.5 Lead Diagnostics V2 (formulário de qualificação)
      const { data: diagnostics } = await (supabase
        .from('lead_diagnostics_v2' as any)
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }) as any);

      // Pegar apenas o diagnóstico mais recente (evitar duplicatas)
      const latestDiagnostic = diagnostics?.[0];
      if (latestDiagnostic) {
        const diag = latestDiagnostic;
        
        // Construir descrição rica
        const descParts = [];
        if (diag.business_stage) descParts.push(`🎯 ${diag.business_stage}`);
        if (diag.monthly_revenue) descParts.push(`💰 ${diag.monthly_revenue}`);
        if (diag.ai_knowledge_level) descParts.push(`🤖 ${diag.ai_knowledge_level}`);
        
        // Construir detalhes expandidos
        const detailsParts = [];
        if (diag.business_description) detailsParts.push(`Negócio: ${diag.business_description}`);
        if (diag.ai_challenges) detailsParts.push(`Desafios: ${diag.ai_challenges}`);
        if (diag.motivation) detailsParts.push(`Motivação: ${diag.motivation}`);
        if (diag.ai_knowledge_detail) detailsParts.push(`Como usa IA: ${diag.ai_knowledge_detail}`);
        if (diag.ai_course_experience) detailsParts.push(`Curso IA: ${diag.ai_course_experience}`);

        // Tags baseadas no score e respostas
        const tags = [];
        if (diag.qualification_score >= 70) tags.push('Qualificado');
        if (diag.qualification_score >= 80) tags.push('Quente');
        if (diag.monthly_revenue?.includes('100.000') || diag.monthly_revenue?.includes('50.000')) tags.push('Alto Ticket');
        if (diag.ai_course_experience === 'Não, ainda não') tags.push('Primeiro Curso');

        events.push({
          id: `diagnostic-${diag.id}`,
          date: diag.created_at,
          time: new Date(diag.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: 'registration',
          team: 'sales',
          title: `📋 Diagnóstico Preenchido${diag.qualification_score ? ` (Score: ${diag.qualification_score})` : ''}`,
          description: descParts.join(' • ') || 'Formulário de qualificação preenchido.',
          details: detailsParts.join(' | ').substring(0, 200) + (detailsParts.join(' | ').length > 200 ? '...' : ''),
          tags: tags.length > 0 ? tags : ['Qualificação'],
          metadata: { 
            diagnostic: diag,
            business_stage: diag.business_stage,
            monthly_revenue: diag.monthly_revenue,
            ai_knowledge_level: diag.ai_knowledge_level,
            ai_challenges: diag.ai_challenges,
            business_description: diag.business_description,
            motivation: diag.motivation,
            ai_knowledge_detail: diag.ai_knowledge_detail,
            ai_course_experience: diag.ai_course_experience,
            which_ai_course: diag.which_ai_course,
            qualification_score: diag.qualification_score,
            age: diag.age,
            gender: diag.gender,
            biggest_dream: diag.biggest_dream,
            immersion_content: diag.immersion_content,
            time_consuming: diag.time_consuming,
            current_activity: diag.current_activity,
            income_types: diag.income_types,
            other_goal: diag.other_goal
          }
        });
      }

      // 6. Alunos (onboarding)
      const { data: alunos } = await (supabase
        .from('alunos' as any)
        .select('*')
        .eq('lead_id', leadId) as any);

      (alunos || []).forEach((aluno: any) => {
        if (aluno.onboarding_inicio) {
          events.push({
            id: `onboard-start-${aluno.id}`,
            date: aluno.onboarding_inicio,
            time: new Date(aluno.onboarding_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'onboarding',
            team: 'cs',
            title: `Início Onboarding: ${aluno.produto_nome}`,
            description: 'Cliente iniciou processo de onboarding.',
            details: aluno.produto_nome
          });
        }
        if (aluno.onboarding_conclusao) {
          events.push({
            id: `onboard-done-${aluno.id}`,
            date: aluno.onboarding_conclusao,
            time: new Date(aluno.onboarding_conclusao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'onboarding',
            team: 'cs',
            title: `Onboarding Concluído: ${aluno.produto_nome}`,
            description: 'Cliente completou todos os módulos iniciais.',
            details: `${aluno.produto_nome} • 100% completo`,
            tags: ['Sucesso']
          });
        }
      });

      // 6.1 Tarefas/Atividades (company_activities) - Para leads E organizations
      // Buscar activity_ids que já têm meeting vinculada (para deduplicar)
      const meetingActivityIds = new Set<string>();
      if (leadId) {
        const dedupFilter = resolvedOrgId
          ? `lead_id.eq.${leadId},organization_id.eq.${resolvedOrgId}`
          : `lead_id.eq.${leadId}`;
        const { data: meetingsWithActivity } = await (supabase
          .from('meetings' as any)
          .select('activity_id')
          .or(dedupFilter)
          .not('activity_id', 'is', null) as any);
        (meetingsWithActivity || []).forEach((m: any) => meetingActivityIds.add(m.activity_id));
      }

      const activityQuery = organizationId
        ? supabase.from('company_activities' as any).select('*').eq('organization_id', organizationId)
        : leadId
          ? supabase.from('company_activities' as any).select('*').eq('lead_id', leadId)
          : null;

      if (activityQuery) {
        const { data: activities } = await (activityQuery.order('created_at', { ascending: false }) as any);

        (activities || []).forEach((activity: any) => {
          // Pular tasks de meeting/call que já aparecem na seção de meetings (evita duplicata)
          if (['meeting', 'call'].includes(activity.task_type) && meetingActivityIds.has(activity.id)) {
            return;
          }
          const taskTypeLabels: Record<string, string> = {
            call: '📞 Ligação',
            meeting: '📹 Reunião',
            onboarding: '🎯 Onboarding',
            whatsapp: '💬 WhatsApp',
            email: '📧 Email',
            follow_up: '🔄 Follow-up',
            nfse: '🧾 NFSe',
            billing: '💰 Cobrança',
          };

          // Webinar events get special card
          if (activity.task_type === 'webinar') {
            const meta = activity.metadata || {};
            const eventDateStr = meta.event_date
              ? new Date(meta.event_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
              : null;
            events.push({
              id: `webinar-${activity.id}`,
              date: activity.created_at,
              time: new Date(activity.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'webinar',
              team: 'marketing',
              title: activity.name || 'Inscreveu no Webinário',
              description: meta.event_topic || meta.quiz_name || 'Inscrição via quiz',
              details: eventDateStr ? `Data: ${eventDateStr}` : (meta.landing_page || ''),
              tags: ['Webinário', ...(meta.utm_source ? [meta.utm_source] : [])],
              metadata: meta,
            });
            return;
          }

          // Stage change events (movimentacao de etapa)
          if (activity.task_type === 'stage_change') {
            events.push({
              id: `stage-change-${activity.id}`,
              date: activity.created_at,
              time: new Date(activity.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'lead',
              team: 'sales',
              title: `🔄 ${activity.name}`,
              description: activity.description || '',
              details: activity.metadata?.changed_by ? `Por: ${activity.metadata.changed_by}` : undefined,
              tags: ['Movimentação'],
              metadata: activity.metadata,
            });
            return;
          }

          // Deal won (ganho)
          if (activity.task_type === 'deal_won') {
            events.push({
              id: `deal-won-audit-${activity.id}`,
              date: activity.created_at,
              time: new Date(activity.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'purchase',
              team: 'sales',
              title: activity.name,
              description: activity.description || '',
              details: activity.metadata?.won_by ? `Por: ${activity.metadata.won_by}` : undefined,
              amount: activity.metadata?.value ? Number(activity.metadata.value) : undefined,
              tags: ['Ganho', 'Auditoria'],
              metadata: activity.metadata,
            });
            return;
          }

          // Deal lost (perdido) — pula se já tem evento de churn/refund (evita duplicata)
          if (activity.task_type === 'deal_lost') {
            // Se deal já tem motivo Churn/Reembolso, o evento de churn é mais informativo
            const reason = activity.metadata?.reason || activity.description || '';
            const isChurnOrRefund = reason.includes('Churn') || reason.includes('Reembolso');
            if (!isChurnOrRefund) {
              events.push({
                id: `deal-lost-audit-${activity.id}`,
                date: activity.created_at,
                time: new Date(activity.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
                type: 'lead',
                team: 'sales',
                title: activity.name,
                description: activity.description || '',
                details: activity.metadata?.lost_by ? `Por: ${activity.metadata.lost_by}` : undefined,
                tags: ['Perdido', 'Auditoria'],
                metadata: activity.metadata,
              });
            }
            return;
          }

          // Refund (reembolso)
          if (activity.task_type === 'refund') {
            events.push({
              id: `refund-${activity.id}`,
              date: activity.created_at,
              time: new Date(activity.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'lead',
              team: 'sales',
              title: activity.name,
              description: activity.description || '',
              details: activity.metadata?.processed_by ? `Por: ${activity.metadata.processed_by}` : undefined,
              amount: activity.metadata?.refund_amount ? Number(activity.metadata.refund_amount) : undefined,
              tags: ['Reembolso', 'Auditoria'],
              metadata: activity.metadata,
            });
            return;
          }

          // NFSe events get special handling
          if (activity.task_type === 'nfse') {
            events.push({
              id: `nfse-${activity.id}`,
              date: activity.created_at,
              time: new Date(activity.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'nfse',
              team: 'sales',
              title: activity.title || '🧾 NFSe Emitida',
              description: activity.description || 'Nota fiscal de servico emitida.',
              details: activity.metadata?.nfse_number ? `NF #${activity.metadata.nfse_number}` : undefined,
              amount: activity.metadata?.valor ? Number(activity.metadata.valor) : undefined,
              tags: ['NFSe'],
              metadata: activity.metadata,
            });
            return;
          }

          // Billing reminder events
          if (activity.task_type === 'billing') {
            events.push({
              id: `billing-${activity.id}`,
              date: activity.created_at,
              time: new Date(activity.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'billing',
              team: 'sales',
              title: activity.title || '💰 Cobranca Enviada',
              description: activity.description || 'Cobranca enviada via WhatsApp.',
              details: activity.metadata?.parcela,
              amount: activity.metadata?.valor ? Number(activity.metadata.valor) : undefined,
              tags: ['Cobranca'],
              metadata: activity.metadata,
            });
            return;
          }

          // Churn events
          if (activity.task_type === 'churn') {
            const meta = activity.metadata || {};
            const detailParts: string[] = [];
            if (meta.churn_reason) detailParts.push(`Motivo: ${meta.churn_reason}`);
            if (meta.has_refund && meta.refund_amount) detailParts.push(`Reembolso: R$ ${Number(meta.refund_amount).toLocaleString('pt-BR')}`);
            if (meta.block_member_area) detailParts.push('Area de membros bloqueada');
            if (meta.remove_from_whatsapp) detailParts.push('Removido do grupo WhatsApp');

            const tags = ['Churn'];
            if (meta.has_refund) tags.push('Reembolso');

            events.push({
              id: `churn-${activity.id}`,
              date: activity.created_at,
              time: new Date(activity.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'churn',
              team: 'cs',
              title: activity.name || '🚨 Churn Registrado',
              description: activity.description || 'Cliente cancelou o serviço.',
              details: detailParts.join(' • '),
              amount: meta.has_refund ? Number(meta.refund_amount) : undefined,
              tags,
              metadata: meta,
            });
            return;
          }
          // Campaign events
          if (activity.task_type === 'campaign') {
            const meta = activity.metadata || {};
            events.push({
              id: `campaign-${activity.id}`,
              date: activity.created_at,
              time: new Date(activity.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'campaign',
              team: 'marketing',
              title: activity.name || 'Campanha',
              description: meta.message_type === 'template' ? 'Template enviado via campanha' : 'Mensagem enviada via campanha',
              details: meta.sent_count ? `${meta.sent_count}/${meta.total_recipients} enviadas` : undefined,
              tags: ['Campanha'],
              metadata: meta,
            });
            return;
          }

          const typeLabel = taskTypeLabels[activity.task_type] || activity.task_type;
          const teamLabel = activity.team === 'sales' ? 'sales' : 'cs';

          // Tarefa agendada/criada
          if (activity.scheduled_at) {
            const scheduledDate = new Date(activity.scheduled_at);
            events.push({
              id: `task-scheduled-${activity.id}`,
              date: activity.scheduled_at,
              time: scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: activity.task_type === 'onboarding' ? 'onboarding' : activity.task_type === 'email' ? 'email_sent' as any : 'support',
              team: teamLabel,
              title: activity.status === 'no_show'
                ? `❌ ${typeLabel} No-show`
                : activity.completed ? `✅ ${typeLabel} Realizada` : `📅 ${typeLabel} Agendada`,
              description: activity.status === 'no_show'
                ? (activity.notes || 'Cliente não compareceu')
                : activity.completed
                  ? (activity.outcome || activity.description || `${typeLabel} concluída.`)
                  : `${typeLabel} agendada para ${scheduledDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}.`,
              details: activity.meeting_link ? `🔗 ${activity.meeting_link}` : (activity.name || ''),
              tags: activity.status === 'no_show' ? ['No-show'] : activity.completed ? ['Concluído'] : ['Agendado'],
              metadata: {
                meeting_link: activity.meeting_link,
                task_id: activity.id,
                call_analysis: activity.metadata?.call_analysis,
                ...(activity.metadata?.email_html ? { email_html: activity.metadata.email_html, email_subject: activity.metadata.email_subject, email_to: activity.metadata.email_to, email_type: activity.metadata.email_type } : {}),
                ...(activity.metadata?.source === 'book_meeting_page' ? {
                  source: activity.metadata.source,
                  company: activity.metadata.company,
                  revenue: activity.metadata.revenue,
                  evento: activity.metadata.evento,
                  utm_source: activity.metadata.utm_source,
                  utm_campaign: activity.metadata.utm_campaign,
                } : {}),
              }
            });
          } else if (!activity.scheduled_at && activity.created_at) {
            // Tarefa sem agendamento (só criada)
            events.push({
              id: `task-created-${activity.id}`,
              date: activity.created_at,
              time: new Date(activity.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: activity.task_type === 'onboarding' ? 'onboarding' : activity.task_type === 'email' ? 'email_sent' as any : 'support',
              team: teamLabel,
              title: activity.task_type === 'email'
                ? `📧 ${activity.name || 'Email enviado'}`
                : `📋 ${typeLabel}: ${activity.name || 'Tarefa'}`,
              description: activity.description || `Tarefa de ${typeLabel} criada.`,
              details: activity.status,
              tags: [activity.status === 'no_show' ? 'No-show' : activity.completed ? 'Concluído' : 'Pendente'],
              metadata: activity.metadata?.email_html ? {
                email_html: activity.metadata.email_html,
                email_subject: activity.metadata.email_subject,
                email_to: activity.metadata.email_to,
                email_type: activity.metadata.email_type,
                task_id: activity.id,
              } : undefined,
            });
          }
        });
      }

      // 6.2 Onboardings (tabela onboardings) - Aprovações, formulários enviados, etc
      if (organizationId) {
        const { data: onboardings } = await (supabase
          .from('onboardings' as any)
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }) as any);

        (onboardings || []).forEach((onb: any) => {
          // Onboarding criado
          if (onb.created_at) {
            events.push({
              id: `onb-created-${onb.id}`,
              date: onb.created_at,
              time: new Date(onb.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'onboarding',
              team: 'cs',
              title: '📝 Onboarding Iniciado',
              description: 'Processo de onboarding iniciado pelo CS.',
              details: `Produto: ${onb.product_id || 'PAIN'}`,
              metadata: { onboarding_id: onb.id, status: onb.status }
            });
          }

          // Link enviado para cliente
          if (onb.form_sent_at) {
            events.push({
              id: `onb-sent-${onb.id}`,
              date: onb.form_sent_at,
              time: new Date(onb.form_sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'onboarding',
              team: 'cs',
              title: '📤 Formulário Enviado',
              description: 'Link do formulário de onboarding enviado para o cliente.',
              details: onb.form_url ? `🔗 ${onb.form_url}` : undefined,
              metadata: { onboarding_id: onb.id }
            });
          }

          // Cliente completou formulário
          if (onb.form_completed_at) {
            events.push({
              id: `onb-completed-${onb.id}`,
              date: onb.form_completed_at,
              time: new Date(onb.form_completed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'onboarding',
              team: 'cs',
              title: '✅ Cliente Completou Formulário',
              description: 'Cliente preencheu e enviou o formulário de onboarding.',
              details: 'Aguardando aprovação do CS',
              tags: ['Ação Necessária'],
              metadata: { onboarding_id: onb.id, confirmed_data: onb.confirmed_data }
            });
          }

          // Onboarding aprovado
          if (onb.approved_at) {
            const webhookResponse = onb.webhook_response || {};
            const summary = webhookResponse.summary || {};
            events.push({
              id: `onb-approved-${onb.id}`,
              date: onb.approved_at,
              time: new Date(onb.approved_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              type: 'onboarding',
              team: 'cs',
              title: '🎉 Onboarding Aprovado',
              description: `Acesso liberado na área de membros.${summary.users_created ? ` ${summary.users_created} usuário(s) criado(s).` : ''}${summary.whatsapp_added ? ` ${summary.whatsapp_added} adicionado(s) ao WhatsApp.` : ''}`,
              details: `Plano: ${onb.plan || 'basic'} • ${onb.seats_limit || 5} membros`,
              tags: ['Sucesso', 'Aprovado'],
              metadata: { onboarding_id: onb.id, webhook_response: webhookResponse }
            });
          }
        });
      }

      // 7. Member daily activity (acessos)
      const { data: memberActivities } = await (supabase
        .from('member_daily_activity' as any)
        .select('*')
        .eq('lead_id', leadId)
        .order('activity_date', { ascending: false })
        .limit(30) as any);

      (memberActivities || []).forEach((act: any) => {
        if (act.sessions > 0) {
          events.push({
            id: `activity-${act.id}`,
            date: act.activity_date,
            time: '-',
            type: 'access',
            team: 'cs',
            title: 'Acessou Área de Membros',
            description: `${act.sessions} sessão(ões), ${act.time_minutes} minutos de estudo.`,
            details: `${act.sessions} sessões • ${act.time_minutes} min • ${act.page_views} páginas${act.lessons_completed > 0 ? ` • ${act.lessons_completed} aula(s) completa(s)` : ''}`
          });
        }
      });

      // 8. Lesson progress (aulas) - AGRUPADAS POR DIA
      const { data: lessons } = await (supabase
        .from('member_lessons_progress' as any)
        .select('*')
        .eq('lead_id', leadId)
        .order('last_watched_at', { ascending: false }) as any);

      // Agrupar aulas por dia
      const lessonsByDay = new Map<string, any[]>();
      (lessons || []).forEach((lesson: any) => {
        if (lesson.started_at) {
          const lessonDate = lesson.last_watched_at || lesson.started_at;
          const day = new Date(lessonDate).toISOString().split('T')[0];
          if (!lessonsByDay.has(day)) {
            lessonsByDay.set(day, []);
          }
          lessonsByDay.get(day)!.push(lesson);
        }
      });

      lessonsByDay.forEach((dayLessons, day) => {
        const firstLesson = dayLessons[0];
        const completedCount = dayLessons.filter((l: any) => l.completed).length;
        const totalMinutes = dayLessons.reduce((sum: number, l: any) => sum + Math.round(l.seconds_watched / 60), 0);
        const lessonTitles = dayLessons.map((l: any) => l.lesson_title).join(', ');
        
        events.push({
          id: `lessons-${day}`,
          date: firstLesson.last_watched_at || firstLesson.started_at,
          time: new Date(firstLesson.last_watched_at || firstLesson.started_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: 'lesson',
          team: 'cs',
          title: dayLessons.length > 1 
            ? `📚 ${dayLessons.length} aulas estudadas${completedCount > 0 ? ` (${completedCount} completa${completedCount > 1 ? 's' : ''})` : ''}`
            : (firstLesson.completed ? `✅ ${firstLesson.lesson_title}` : `📖 ${firstLesson.lesson_title}`),
          description: dayLessons.length > 1 
            ? `Aulas: ${lessonTitles.substring(0, 100)}${lessonTitles.length > 100 ? '...' : ''}`
            : (firstLesson.completed ? 'Aula concluída com sucesso.' : `Aula em progresso - ${Math.round(firstLesson.seconds_watched / 60)} min assistidos.`),
          details: `${totalMinutes} min total • ${completedCount}/${dayLessons.length} completas`,
          tags: completedCount === dayLessons.length ? ['Completas'] : completedCount > 0 ? ['Parcial'] : ['Em progresso']
        });
      });

      // 9. WhatsApp messages
      const { data: messages } = await (supabase
        .from('whatsapp_messages' as any)
        .select('*')
        .eq('lead_id', leadId)
        .order('sent_at', { ascending: false })
        .limit(50) as any);

      // Agrupar mensagens por dia para criar eventos de suporte
      const messagesByDay = new Map<string, any[]>();
      (messages || []).forEach((msg: any) => {
        const day = new Date(msg.sent_at).toISOString().split('T')[0];
        if (!messagesByDay.has(day)) {
          messagesByDay.set(day, []);
        }
        messagesByDay.get(day)!.push(msg);
      });

      messagesByDay.forEach((dayMessages, day) => {
        const firstMsg = dayMessages[dayMessages.length - 1];
        const lastMsg = dayMessages[0];
        const clientMessages = dayMessages.filter((m: any) => !m.is_from_me);
        const teamMessages = dayMessages.filter((m: any) => m.is_from_me);
        
        // Ordenar mensagens por data (mais antiga primeiro para leitura cronológica)
        const sortedMessages = [...dayMessages].sort((a, b) => 
          new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
        );
        
        if (clientMessages.length > 0 || teamMessages.length > 0) {
          events.push({
            id: `whatsapp-${day}`,
            date: firstMsg.sent_at,
            time: new Date(firstMsg.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'whatsapp',
            team: 'cs',
            title: 'Conversa WhatsApp',
            description: clientMessages[0]?.content?.substring(0, 100) || teamMessages[0]?.content?.substring(0, 100) || 'Mensagem',
            details: `${dayMessages.length} mensagens • ${teamMessages.length > 0 ? `Respondido por ${teamMessages[0]?.sender_name || 'equipe'}` : 'Aguardando resposta'}`,
            tags: teamMessages.length > 0 ? ['Respondido'] : ['Pendente'],
            metadata: {
              messages: sortedMessages,
              totalMessages: dayMessages.length,
              clientMessages: clientMessages.length,
              teamMessages: teamMessages.length,
              respondedBy: teamMessages[0]?.sender_name,
            }
          });
        }
      });

      // 10. Instagram profile
      if (lead?.instagram_profile_id) {
        const { data: igProfile } = await (supabase
          .from('instagram_profiles' as any)
          .select('*')
          .eq('id', lead.instagram_profile_id)
          .single() as any);

        if (igProfile) {
          events.push({
            id: `ig-${igProfile.id}`,
            date: igProfile.created_at,
            time: new Date(igProfile.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'instagram',
            team: 'sales',
            title: 'Perfil Instagram Processado',
            description: `@${igProfile.username} - ${igProfile.full_name}`,
            details: `${igProfile.profile_data?.followersCount || 0} seguidores • ${igProfile.profile_data?.postsCount || 0} posts`,
            metadata: igProfile
          });
        }
      }

      // 10b. Instagram DM messages (grouped by day, same pattern as WhatsApp)
      if (leadId) {
        // Find conversations linked to this lead
        const { data: igConversations } = await (supabase
          .from('instagram_conversations' as any)
          .select('id, participant_username, participant_name')
          .eq('lead_id', leadId) as any);

        if (igConversations && igConversations.length > 0) {
          const convIds = igConversations.map((c: any) => c.id);
          const convMap = new Map(igConversations.map((c: any) => [c.id, c]));

          const { data: igMessages } = await (supabase
            .from('instagram_messages' as any)
            .select('id, conversation_id, content, message_type, is_from_me, sender_username, created_at')
            .in('conversation_id', convIds)
            .order('created_at', { ascending: false })
            .limit(50) as any);

          // Group messages by day
          const igMessagesByDay = new Map<string, any[]>();
          (igMessages || []).forEach((msg: any) => {
            const day = new Date(msg.created_at).toISOString().split('T')[0];
            if (!igMessagesByDay.has(day)) igMessagesByDay.set(day, []);
            igMessagesByDay.get(day)!.push(msg);
          });

          igMessagesByDay.forEach((dayMessages, day) => {
            const firstMsg = dayMessages[dayMessages.length - 1];
            const clientMessages = dayMessages.filter((m: any) => !m.is_from_me);
            const teamMessages = dayMessages.filter((m: any) => m.is_from_me);
            const conv = convMap.get(firstMsg.conversation_id);
            const username = conv?.participant_username || firstMsg.sender_username || 'Instagram';

            const sortedMessages = [...dayMessages].sort((a: any, b: any) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            if (clientMessages.length > 0 || teamMessages.length > 0) {
              const preview = clientMessages[0]?.content?.substring(0, 100) || teamMessages[0]?.content?.substring(0, 100) || 'Mensagem';
              events.push({
                id: `ig-dm-${day}-${firstMsg.conversation_id}`,
                date: firstMsg.created_at,
                time: new Date(firstMsg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                type: 'instagram',
                team: 'sales',
                title: `DM Instagram @${username}`,
                description: preview,
                details: `${dayMessages.length} mensagens • ${clientMessages.length} recebidas • ${teamMessages.length} enviadas`,
                tags: teamMessages.length > 0 ? ['Respondido'] : ['Pendente'],
                metadata: {
                  messages: sortedMessages,
                  totalMessages: dayMessages.length,
                  clientMessages: clientMessages.length,
                  teamMessages: teamMessages.length,
                  username,
                }
              });
            }
          });
        }
      }

      // 11. Tarefas (company_activities) por org — DESATIVADO: já coberto pela seção 6.1
      // A seção 6.1 busca activities por organization_id ou lead_id, cobrindo todos os casos
      if (false && organizationId) {
        const { data: tasks } = await (supabase as any)
          .from('company_activities')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        const taskTypeLabels: Record<string, string> = {
          'internal': '🗓️ internal',
          'follow_up': '📞 Follow-up',
          'onboarding_call': '🎓 Onboarding',
          'support': '🎧 Suporte',
          'review': '📊 Review',
          'renewal': '🔄 Renovação',
          'training': '📚 Treinamento',
          'checkin': '✅ Check-in',
        };

        (tasks || []).forEach((task: any) => {
          const typeLabel = taskTypeLabels[task.task_type] || task.task_type || 'Tarefa';
          
          events.push({
            id: `task-${task.id}`,
            date: task.due_datetime || task.created_at,
            time: task.due_datetime 
              ? new Date(task.due_datetime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : new Date(task.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'support', // Usando support como tipo genérico para tarefas
            team: task.team === 'sales' ? 'sales' : 'cs',
            title: task.status === 'no_show'
              ? `❌ ${typeLabel} No-show`
              : `${typeLabel} ${task.completed ? '✓' : ''}`,
            description: task.status === 'no_show'
              ? (task.notes || 'Cliente não compareceu')
              : (task.name || 'Tarefa'),
            details: task.description || '',
            tags: task.status === 'no_show' ? ['No-show'] : task.completed ? ['Concluída'] : task.priority === 'high' ? ['Urgente'] : ['Agendado'],
            metadata: {
              task: task,
              taskType: task.task_type,
              priority: task.priority,
              completed: task.completed,
              dueDate: task.due_datetime,
              notes: task.notes,
            }
          });
        });
      }

      // 12. CS Touchpoints
      if (organizationId) {
        const { data: touchpoints } = await (supabase as any)
          .from('cs_touchpoints')
          .select('*')
          .eq('organization_id', organizationId)
          .order('touchpoint_date', { ascending: false });

        const touchpointTypeLabels: Record<string, string> = {
          'checkin': 'Check-in',
          'support': 'Suporte',
          'training': 'Treinamento',
          'review': 'Review',
          'renewal': 'Renovação',
          'onboarding': 'Onboarding',
          'other': 'Outro',
        };

        const channelLabels: Record<string, string> = {
          'whatsapp': 'WhatsApp',
          'zoom': 'Zoom/Meet',
          'email': 'Email',
          'phone': 'Telefone',
          'in_app': 'In-App',
          'other': 'Outro',
        };

        const sentimentLabels: Record<string, { label: string; emoji: string }> = {
          'positive': { label: 'Positivo', emoji: '😊' },
          'neutral': { label: 'Neutro', emoji: '😐' },
          'negative': { label: 'Negativo', emoji: '😟' },
        };

        (touchpoints || []).forEach((tp: any) => {
          const typeLabel = touchpointTypeLabels[tp.type] || tp.type;
          const channelLabel = channelLabels[tp.channel] || tp.channel;
          const sentimentInfo = sentimentLabels[tp.sentiment] || { label: tp.sentiment, emoji: '💬' };

          // Construir detalhes
          const detailsParts = [];
          detailsParts.push(`📞 ${channelLabel}`);
          detailsParts.push(`${sentimentInfo.emoji} ${sentimentInfo.label}`);
          if (tp.next_action) {
            detailsParts.push(`📋 Próxima ação: ${tp.next_action}`);
          }
          if (tp.next_contact_date) {
            detailsParts.push(`📅 Próximo contato: ${new Date(tp.next_contact_date).toLocaleDateString('pt-BR')}`);
          }

          // Tags baseadas no sentimento
          const tags = [];
          if (tp.sentiment === 'positive') tags.push('Positivo');
          if (tp.sentiment === 'negative') tags.push('Atenção');
          if (tp.next_action) tags.push('Follow-up');

          events.push({
            id: `touchpoint-${tp.id}`,
            date: tp.touchpoint_date,
            time: new Date(tp.created_at || tp.touchpoint_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'touchpoint',
            team: 'cs',
            title: `${sentimentInfo.emoji} ${typeLabel} via ${channelLabel}`,
            description: tp.summary,
            details: detailsParts.join(' • '),
            tags: tags.length > 0 ? tags : undefined,
            metadata: {
              touchpoint: tp,
              type: tp.type,
              channel: tp.channel,
              sentiment: tp.sentiment,
              next_action: tp.next_action,
              next_contact_date: tp.next_contact_date,
              screenshot: tp.metadata?.screenshot,
            }
          });
        });
      }

      // 13. Meetings - REMOVIDO (duplicado com seção 15)
      // Agora as meetings são buscadas apenas na seção 15 com suporte a ai_analysis

      // 14. Call History (chamadas VoIP)
      const { data: calls } = await (supabase
        .from('call_history' as any)
        .select('*')
        .eq('lead_id', leadId)
        .order('started_at', { ascending: false }) as any);

      (calls || []).forEach((call: any) => {
        const isIncoming = call.direction === 'INCOMING';
        const isMissed = ['REJECTED', 'NOT_ANSWERED', 'FAILED'].includes(call.status);
        const hasAI = !!call.ai_summary;
        const hasRecording = call.record_status === 'READY' && call.record_url;
        const hasTranscription = call.transcriptions && call.transcriptions.length > 0;

        // Duration formatting
        const duration = call.duration_seconds || 0;
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;

        // Sentiment info
        const sentimentEmoji = call.ai_sentiment === 'positive' ? '😊' : call.ai_sentiment === 'negative' ? '😟' : '😐';
        const sentimentLabel = call.ai_sentiment === 'positive' ? 'Positivo' : call.ai_sentiment === 'negative' ? 'Negativo' : 'Neutro';

        // Build title
        let title = isMissed
          ? `📵 Chamada Perdida`
          : isIncoming
            ? `📞 Chamada Recebida`
            : `📞 Chamada Realizada`;

        if (hasAI) {
          title += ` ${sentimentEmoji}`;
        }

        // Build description
        let description = call.ai_summary || (isMissed ? 'Chamada não atendida' : `Duração: ${durationStr}`);

        // Build details
        const detailsParts = [];
        detailsParts.push(`⏱️ ${durationStr}`);
        if (hasRecording) detailsParts.push('🎙️ Gravado');
        if (hasTranscription) detailsParts.push(`📝 ${call.transcriptions.length} msgs`);
        if (hasAI) detailsParts.push(`${sentimentEmoji} ${sentimentLabel}`);

        // Tags
        const tags = [];
        if (isMissed) tags.push('Perdida');
        if (hasAI && call.ai_sentiment === 'positive') tags.push('Positivo');
        if (hasAI && call.ai_sentiment === 'negative') tags.push('Atenção');
        if (hasRecording) tags.push('Gravado');

        events.push({
          id: `call-${call.id}`,
          date: call.started_at,
          time: new Date(call.started_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: 'call',
          team: 'sales',
          title,
          description,
          details: detailsParts.join(' • '),
          tags: tags.length > 0 ? tags : undefined,
          metadata: {
            call_id: call.id,
            call: call,
            direction: call.direction,
            status: call.status,
            duration_seconds: call.duration_seconds,
            peer_phone: call.peer_phone,
            peer_name: call.peer_name,
            record_url: call.record_url,
            record_status: call.record_status,
            transcriptions: call.transcriptions,
            ai_summary: call.ai_summary,
            ai_sentiment: call.ai_sentiment,
            ai_key_points: call.ai_key_points,
            ai_suggested_tasks: call.ai_suggested_tasks,
          }
        });
      });

      // 15. Meetings (reuniões via Google Meet/Zoom com transcrição)
      // Buscar por lead_id E também por organization_id (caso meeting tenha sido criada sem lead_id)
      let meetingsQuery = supabase
        .from('meetings' as any)
        .select('*')
        .in('status', ['completed', 'no_show'])
        .order('started_at', { ascending: false }) as any;

      if (organizationId) {
        meetingsQuery = meetingsQuery.or(`lead_id.eq.${leadId},organization_id.eq.${organizationId}`) as any;
      } else {
        meetingsQuery = meetingsQuery.eq('lead_id', leadId) as any;
      }

      const { data: meetings } = await (meetingsQuery as any);

      (meetings || []).forEach((meeting: any) => {
        const isNoShow = meeting.status === 'no_show';
        const hasTranscription = meeting.transcriptions && meeting.transcriptions.length > 0;
        // ai_analysis está na coluna direta, não em metadata
        const aiAnalysis = meeting.ai_analysis;
        const hasAI = !!aiAnalysis;
        
        // Duration formatting (from started_at to ended_at)
        let durationStr = '0:00';
        if (meeting.started_at && meeting.ended_at) {
          const start = new Date(meeting.started_at).getTime();
          const end = new Date(meeting.ended_at).getTime();
          const durationSecs = Math.floor((end - start) / 1000);
          const mins = Math.floor(durationSecs / 60);
          const secs = durationSecs % 60;
          durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        // Sentiment info from AI analysis
        const sentiment = aiAnalysis?.sentimento;
        const sentimentEmoji = sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😟' : '😐';
        const sentimentLabel = sentiment === 'positive' ? 'Positivo' : sentiment === 'negative' ? 'Negativo' : 'Neutro';

        // Build title
        let title = isNoShow
          ? `📵 Reunião No-show`
          : `📹 Reunião Realizada`;

        if (hasAI && !isNoShow) {
          title += ` ${sentimentEmoji}`;
        }

        // Build description
        let description = aiAnalysis?.diagnostico 
          || meeting.title 
          || (isNoShow ? 'Cliente não compareceu' : `Duração: ${durationStr}`);

        // Build details
        const detailsParts = [];
        if (!isNoShow) detailsParts.push(`⏱️ ${durationStr}`);
        if (hasTranscription) detailsParts.push(`📝 ${meeting.transcriptions.length} msgs`);
        if (hasAI) detailsParts.push(`${sentimentEmoji} ${sentimentLabel}`);
        const meetingTypeLabels: Record<string, string> = {
          cs_meeting: 'CS', onboarding: 'Onboarding', sales_call: 'Comercial', internal: 'Interno',
        };
        if (meeting.meeting_type) detailsParts.push(`🎥 ${meetingTypeLabels[meeting.meeting_type] || meeting.meeting_type}`);

        // Tags
        const tags = [];
        if (isNoShow) tags.push('No-show');
        if (hasAI && sentiment === 'positive') tags.push('Positivo');
        if (hasAI && sentiment === 'negative') tags.push('Atenção');
        if (hasTranscription) tags.push('Transcrito');

        events.push({
          id: `meeting-${meeting.id}`,
          date: meeting.started_at || meeting.created_at,
          time: new Date(meeting.started_at || meeting.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: 'meeting',
          team: meeting.team === 'cs' ? 'cs' : 'sales',
          title,
          description,
          details: detailsParts.join(' • '),
          tags: tags.length > 0 ? tags : undefined,
          metadata: {
            meeting_id: meeting.id,
            meeting: meeting,
            status: meeting.status,
            meeting_type: meeting.meeting_type,
            meeting_link: meeting.meeting_link,
            transcriptions: meeting.transcriptions,
            call_analysis: aiAnalysis, // Usar ai_analysis da coluna direta
            ai_analysis: aiAnalysis, // Duplicar para garantir acesso
            started_at: meeting.started_at,
            ended_at: meeting.ended_at,
          }
        });
      });

      // 16. Sales Notes (notas e interações)
      const { data: notes } = await (supabase
        .from('sales_notes' as any)
        .select(`
          *,
          creator:team_members!created_by(id, name)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }) as any);

      const noteTypeLabels: Record<string, { label: string; emoji: string }> = {
        'note': { label: 'Nota', emoji: '📝' },
        'research': { label: 'Pesquisa', emoji: '🔍' },
        'call_summary': { label: 'Resumo de Ligação', emoji: '📞' },
        'objection': { label: 'Objeção', emoji: '⚠️' },
        'follow_up': { label: 'Follow-up', emoji: '🔄' },
        'meeting_notes': { label: 'Notas de Reunião', emoji: '📋' },
      };

      (notes || []).forEach((note: any) => {
        const typeInfo = noteTypeLabels[note.note_type] || noteTypeLabels['note'];
        
        events.push({
          id: `note-${note.id}`,
          date: note.created_at,
          time: new Date(note.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: 'note',
          team: 'sales',
          title: `${typeInfo.emoji} ${typeInfo.label}`,
          description: note.content.length > 150 ? note.content.substring(0, 150) + '...' : note.content,
          details: note.creator?.name ? `Por ${note.creator.name}` : undefined,
          tags: [typeInfo.label],
          metadata: {
            note_id: note.id,
            note: note,
            note_type: note.note_type,
            full_content: note.content,
            created_by: note.creator,
          }
        });
      });

      // 17. Palestras (formulário de interesse em palestra)
      if (lead?.phone) {
        const normalizedPhone = lead.phone.replace(/[^0-9+]/g, '');
        const { data: palestras } = await (supabase
          .from('palestras' as any)
          .select('*')
          .order('created_at', { ascending: false }) as any);

        (palestras || []).forEach((p: any) => {
          const pPhone = (p.whatsapp || '').replace(/[^0-9+]/g, '');
          if (pPhone === normalizedPhone) {
            const detailsParts = [];
            if (p.nome) detailsParts.push(`👤 ${p.nome}`);
            if (p.empresa) detailsParts.push(`🏢 ${p.empresa}`);
            if (p.whatsapp) detailsParts.push(`📱 ${p.whatsapp}`);
            if (p.email) detailsParts.push(`📧 ${p.email}`);
            if (p.detalhes) detailsParts.push(`📋 ${p.detalhes}`);

            events.push({
              id: `palestra-${p.id}`,
              date: p.created_at,
              time: new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              type: 'palestra',
              team: 'sales',
              title: '🎤 Interesse em Palestra',
              description: `${p.nome} — ${p.empresa}`,
              details: detailsParts.join(' • '),
              tags: ['Palestra'],
              metadata: {
                palestra: p,
                nome: p.nome,
                empresa: p.empresa,
                whatsapp: p.whatsapp,
                email: p.email,
                detalhes: p.detalhes,
              }
            });
          }
        });
      }

      // Testimonials (depoimentos do cliente)
      if (resolvedOrgId) {
        const { data: testimonials } = await (supabase
          .from('testimonials' as any)
          .select('id, content, rating, video_url, image_url, tags, contact_name, collected_at, created_at')
          .eq('organization_id', resolvedOrgId)
          .eq('is_active', true) as any);

        testimonials?.forEach((t: any) => {
          const date = t.collected_at || t.created_at;
          const mediaType = t.video_url ? '🎬 Vídeo' : t.image_url ? '📸 Print' : t.tags?.includes('audio') ? '🎤 Áudio' : '💬 Texto';
          events.push({
            id: `testimonial-${t.id}`,
            date,
            time: new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: 'testimonial' as any,
            team: 'cs',
            title: `Depoimento — ${mediaType}`,
            description: t.content || 'Depoimento registrado',
            tags: ['⭐ Depoimento', ...(t.rating ? [`${t.rating}/5`] : [])],
            metadata: { image_url: t.image_url, video_url: t.video_url },
          });
        });
      }

      // Prioridade para desempate quando timestamps são idênticos
      // Número MENOR = aconteceu PRIMEIRO cronologicamente
      const typeOrder: Record<string, number> = {
        'lead': 1,         // Lead é sempre o primeiro evento
        'registration': 2, // Inscrição vem logo após o lead
        'event_rsvp': 3,   // RSVP evento presencial
        'visit': 4,        // Visitas
        'instagram': 5,    // Instagram processado
        'checkout': 6,
        'payment': 7,
        'purchase': 8,
        'call': 9,         // Chamadas VoIP
        'meeting': 10,     // Reuniões
        'note': 11,        // Notas/interações
        'touchpoint': 15,  // Touchpoints CS
        'onboarding': 12,
        'access': 13,
        'lesson': 14,
        'whatsapp': 15,
        'support': 16,
        'testimonial': 17,
        'palestra': 3.5,
      };

      // Ordenar por data/hora (mais RECENTE primeiro - aparece no topo)
      events.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        
        // Tratar datas inválidas
        if (isNaN(dateA) && isNaN(dateB)) return 0;
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        
        // Se timestamps são diferentes, ordenar por data (mais recente primeiro)
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        
        // Se timestamps são IGUAIS, usar ordem lógica por tipo
        // Maior typeOrder = aconteceu depois = deve aparecer primeiro (no topo)
        const orderA = typeOrder[a.type] || 99;
        const orderB = typeOrder[b.type] || 99;
        return orderB - orderA;
      });

      // ══════ DEDUPLICAÇÃO GLOBAL ══════
      // Remover eventos com mesmo título na mesma janela de 2 minutos
      const seen = new Set<string>();
      const deduped = events.filter(e => {
        const dateMinute = new Date(e.date).toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
        const key = `${e.title}::${dateMinute}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return deduped;
    },
    enabled: !!leadId,
  });
};
