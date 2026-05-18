import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Tipos
export type AcaoDeHoje = 'ENVIAR_MENSAGEM' | 'LIGAR' | 'AGUARDAR' | 'CONFIRMAR_CALL' | 'RESGATAR_NO_SHOW' | 'ENCERRAR';
export type EtapaFunil = 'novo' | 'em_contato' | 'qualificado' | 'call_agendada' | 'no_show' | 'call_realizada' | 'em_fechamento' | 'ganho' | 'perdido';
export type StatusResposta = 'RESPONDEU' | 'NAO_RESPONDEU';
export type UltimaAcao = 'VENDEDOR' | 'LEAD';

export interface LeadComAcao {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  instagram?: string;
  acao_de_hoje: AcaoDeHoje;
  etapa_funil: EtapaFunil;
  dia_do_playbook: number;
  tentativas_de_contato: number;
  status_de_resposta: StatusResposta;
  ultima_acao?: UltimaAcao;
  sales_score?: number;
  created_at: string;
  // Dados extras para contexto
  ultima_mensagem_at?: string;
  proxima_call_at?: string;
}

export interface ResumoAcoes {
  enviar_mensagem: number;
  ligar: number;
  confirmar_call: number;
  resgatar_no_show: number;
  total_acoes: number;
}

export interface ResumoFunil {
  novo: number;
  em_contato: number;
  qualificado: number;
  call_agendada: number;
  no_show: number;
  call_realizada: number;
  em_fechamento: number;
  ganho: number;
  perdido: number;
}

// Hook: Resumo das ações do dia
export const useResumoAcoes = () => {
  return useQuery({
    queryKey: ['resumo-acoes-hoje'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('acao_de_hoje')
        .neq('acao_de_hoje', 'AGUARDAR')
        .neq('acao_de_hoje', 'ENCERRAR');

      if (error) throw error;

      const resumo: ResumoAcoes = {
        enviar_mensagem: 0,
        ligar: 0,
        confirmar_call: 0,
        resgatar_no_show: 0,
        total_acoes: 0,
      };

      (data || []).forEach((lead: any) => {
        switch (lead.acao_de_hoje) {
          case 'ENVIAR_MENSAGEM':
            resumo.enviar_mensagem++;
            break;
          case 'LIGAR':
            resumo.ligar++;
            break;
          case 'CONFIRMAR_CALL':
            resumo.confirmar_call++;
            break;
          case 'RESGATAR_NO_SHOW':
            resumo.resgatar_no_show++;
            break;
        }
        resumo.total_acoes++;
      });

      return resumo;
    },
    refetchInterval: 30000, // Atualiza a cada 30s
  });
};

// Hook: Fila de trabalho do dia
export const useFilaDeTrabalho = () => {
  return useQuery({
    queryKey: ['fila-trabalho-hoje'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          id,
          name,
          email,
          phone,
          instagram,
          acao_de_hoje,
          etapa_funil,
          dia_do_playbook,
          tentativas_de_contato,
          status_de_resposta,
          ultima_acao,
          sales_score,
          created_at
        `)
        .neq('acao_de_hoje', 'AGUARDAR')
        .neq('acao_de_hoje', 'ENCERRAR')
        .order('sales_score', { ascending: false, nullsFirst: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as LeadComAcao[];
    },
  });
};

// Hook: Resumo do funil
export const useResumoFunil = () => {
  return useQuery({
    queryKey: ['resumo-funil'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('etapa_funil')
        .not('etapa_funil', 'is', null);

      if (error) throw error;

      const resumo: ResumoFunil = {
        novo: 0,
        em_contato: 0,
        qualificado: 0,
        call_agendada: 0,
        no_show: 0,
        call_realizada: 0,
        em_fechamento: 0,
        ganho: 0,
        perdido: 0,
      };

      (data || []).forEach((lead: any) => {
        if (lead.etapa_funil && resumo.hasOwnProperty(lead.etapa_funil)) {
          resumo[lead.etapa_funil as keyof ResumoFunil]++;
        }
      });

      return resumo;
    },
  });
};

// Hook: Leads por etapa do funil
export const useLeadsPorEtapa = (etapa: EtapaFunil) => {
  return useQuery({
    queryKey: ['leads-por-etapa', etapa],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          id,
          name,
          email,
          phone,
          instagram,
          acao_de_hoje,
          etapa_funil,
          dia_do_playbook,
          sales_score,
          created_at
        `)
        .eq('etapa_funil', etapa)
        .order('sales_score', { ascending: false, nullsFirst: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as LeadComAcao[];
    },
    enabled: !!etapa,
  });
};

// Hook: Métricas de performance
export const useMetricasVendas = () => {
  return useQuery({
    queryKey: ['metricas-vendas'],
    queryFn: async () => {
      // Total de leads ativos no comercial (com sales_stage preenchido ou criados recentemente)
      const { count: totalLeadsAtivos } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .not('sales_stage', 'is', null);

      // Total de deals
      const { count: totalDeals } = await supabase
        .from('deals')
        .select('*', { count: 'exact', head: true });

      // Deals ganhos (status = 'won')
      const { data: dealsGanhos, count: ganhosCount } = await supabase
        .from('deals')
        .select('negotiated_price', { count: 'exact' })
        .eq('status', 'won');

      const valorTotal = (dealsGanhos || []).reduce((sum, d) => sum + (parseFloat(d.negotiated_price) || 0), 0);
      const ticketMedio = dealsGanhos && dealsGanhos.length > 0 ? valorTotal / dealsGanhos.length : 0;

      // Taxa de conversão baseada em deals (ganhos / total deals)
      const taxaConversao = totalDeals && totalDeals > 0 ? ((ganhosCount || 0) / totalDeals) * 100 : 0;

      return {
        total_leads: totalLeadsAtivos || 0,
        total_deals: totalDeals || 0,
        ganhos: ganhosCount || 0,
        valor_total: valorTotal,
        ticket_medio: ticketMedio,
        taxa_conversao: taxaConversao,
      };
    },
  });
};

// Mutation: Executar ação no lead
export const useExecutarAcao = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      acao,
      novaEtapa,
    }: {
      leadId: string;
      acao: AcaoDeHoje;
      novaEtapa?: EtapaFunil;
    }) => {
      const updates: Record<string, any> = {
        ultima_acao: 'VENDEDOR',
        tentativas_de_contato: supabase.rpc('increment_tentativas', { lead_id: leadId }),
      };

      // Se enviou mensagem, avança no playbook
      if (acao === 'ENVIAR_MENSAGEM') {
        const { data: lead } = await supabase
          .from('leads')
          .select('dia_do_playbook, tentativas_de_contato')
          .eq('id', leadId)
          .single();

        const novoDia = (lead?.dia_do_playbook || 0) + 1;
        updates.dia_do_playbook = novoDia;
        updates.tentativas_de_contato = (lead?.tentativas_de_contato || 0) + 1;

        // Lógica do playbook
        if (novoDia >= 9) {
          updates.acao_de_hoje = 'ENCERRAR';
        } else if ([3, 6, 7].includes(novoDia)) {
          updates.acao_de_hoje = 'AGUARDAR';
        } else {
          updates.acao_de_hoje = 'ENVIAR_MENSAGEM';
        }

        // Muda etapa para "em_contato" se ainda estava em "novo"
        if (!novaEtapa) {
          const { data: leadAtual } = await supabase
            .from('leads')
            .select('etapa_funil')
            .eq('id', leadId)
            .single();

          if (leadAtual?.etapa_funil === 'novo') {
            updates.etapa_funil = 'em_contato';
          }
        }
      }

      if (novaEtapa) {
        updates.etapa_funil = novaEtapa;
      }

      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fila-trabalho-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['resumo-acoes-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['resumo-funil'] });
    },
  });
};

// Mutation: Registrar resposta do lead
export const useRegistrarResposta = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      // Lead respondeu - sai do playbook automático
      const { data, error } = await supabase
        .from('leads')
        .update({
          status_de_resposta: 'RESPONDEU',
          ultima_acao: 'LEAD',
          acao_de_hoje: 'LIGAR', // Próxima ação é ligar para qualificar
          etapa_funil: 'em_contato',
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fila-trabalho-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['resumo-acoes-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['resumo-funil'] });
    },
  });
};

// Mutation: Ativar lead no playbook (coloca na fila de trabalho)
// Usa RPC que automaticamente exclui leads que já são clientes
export const useAtivarNoPlaybook = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase
        .rpc('ativar_leads_no_playbook', { lead_ids: [leadId] });

      if (error) throw error;

      // Se não ativou nenhum lead, significa que é cliente
      if (!data || data.length === 0) {
        throw new Error('Este lead já é cliente e não pode ser ativado no playbook.');
      }

      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fila-trabalho-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['resumo-acoes-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['resumo-funil'] });
      queryClient.invalidateQueries({ queryKey: ['leads-por-etapa'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
    },
  });
};

// Mutation: Ativar múltiplos leads no playbook (usa RPC que exclui clientes)
export const useAtivarLeadsEmMassa = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadIds: string[]) => {
      // Usa a RPC que automaticamente exclui leads que já são clientes
      const { data, error } = await supabase
        .rpc('ativar_leads_no_playbook', { lead_ids: leadIds });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fila-trabalho-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['resumo-acoes-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['resumo-funil'] });
      queryClient.invalidateQueries({ queryKey: ['leads-por-etapa'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
    },
  });
};

// Mutation: Mover lead no funil
export const useMoverNoFunil = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      novaEtapa,
      novaAcao,
    }: {
      leadId: string;
      novaEtapa: EtapaFunil;
      novaAcao?: AcaoDeHoje;
    }) => {
      const updates: Record<string, any> = {
        etapa_funil: novaEtapa,
      };

      // Define ação padrão baseada na etapa
      if (novaAcao) {
        updates.acao_de_hoje = novaAcao;
      } else {
        switch (novaEtapa) {
          case 'call_agendada':
            updates.acao_de_hoje = 'CONFIRMAR_CALL';
            break;
          case 'no_show':
            updates.acao_de_hoje = 'RESGATAR_NO_SHOW';
            break;
          case 'qualificado':
          case 'call_realizada':
          case 'em_fechamento':
            updates.acao_de_hoje = 'LIGAR';
            break;
          case 'ganho':
          case 'perdido':
            updates.acao_de_hoje = 'ENCERRAR';
            break;
          default:
            updates.acao_de_hoje = 'AGUARDAR';
        }
      }

      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fila-trabalho-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['resumo-acoes-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['resumo-funil'] });
      queryClient.invalidateQueries({ queryKey: ['leads-por-etapa'] });
    },
  });
};
