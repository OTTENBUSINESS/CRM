import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const DEFAULT_TEMPLATE = `Ola {{primeiro_nome}}! 👋

Passando para lembrar sobre o pagamento da {{parcela}} no valor de R$ {{valor}}, com vencimento em {{vencimento}}.

Produto: {{produto}}

Se ja realizou o pagamento, por favor desconsidere esta mensagem. Caso tenha alguma duvida, estamos a disposicao!

Obrigado! 🙏`;

interface BillingConfig {
  billing_reminder_template: string | null;
  pix_key: string | null;
  pix_type: string | null;
  pix_name: string | null;
}

export function useBillingReminderTemplate() {
  return useQuery({
    queryKey: ['billing-reminder-template'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fiscal_config' as any)
        .select('billing_reminder_template')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as any)?.billing_reminder_template as string | null;
    },
  });
}

interface BillingMessageVars {
  cliente: string;
  primeiro_nome: string;
  valor: string;
  parcela: string;
  vencimento: string;
  total_parcelas: string;
  produto: string;
}

export function buildBillingMessage(template: string, vars: BillingMessageVars): string {
  return template
    .replace(/\{\{cliente\}\}/g, vars.cliente)
    .replace(/\{\{primeiro_nome\}\}/g, vars.primeiro_nome)
    .replace(/\{\{valor\}\}/g, vars.valor)
    .replace(/\{\{parcela\}\}/g, vars.parcela)
    .replace(/\{\{vencimento\}\}/g, vars.vencimento)
    .replace(/\{\{total_parcelas\}\}/g, vars.total_parcelas)
    .replace(/\{\{produto\}\}/g, vars.produto);
}

export function getDefaultTemplate() {
  return DEFAULT_TEMPLATE;
}

interface SendBillingReminderParams {
  leadId: string;
  message: string;
  parcela?: string;
  valor?: number;
  vencimento?: string;
  produto?: string;
}

export function useSendBillingReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, message, parcela, valor, vencimento, produto }: SendBillingReminderParams) => {
      // 1. Fetch lead phone
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('phone, name')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) throw new Error('Lead nao encontrado');
      if (!lead.phone) throw new Error('Lead sem telefone cadastrado');

      // 2. Fetch CAROL instance
      const { data: instance, error: instError } = await supabase
        .from('whatsapp_instances' as any)
        .select('api_url, api_key')
        .ilike('name', '%carol%')
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle();

      if (instError || !instance) throw new Error('Instancia CAROL nao encontrada ou desconectada');

      // 3. Fetch PIX config
      const { data: pixConfig } = await supabase
        .from('fiscal_config' as any)
        .select('pix_key, pix_type, pix_name')
        .limit(1)
        .maybeSingle();

      // 4. Format phone number
      let phone = lead.phone.replace(/\D/g, '');
      if (phone.length <= 11 && !phone.startsWith('55')) {
        phone = '55' + phone;
      }

      const apiUrl = (instance as any).api_url as string;
      const apiKey = (instance as any).api_key as string;
      const headers = { 'Content-Type': 'application/json', token: apiKey };

      // 5. Send text message
      const textResponse = await fetch(`${apiUrl}/send/text`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ number: phone, text: message }),
      });

      if (!textResponse.ok) {
        const errorBody = await textResponse.text();
        throw new Error(`Erro ao enviar texto: ${textResponse.status} - ${errorBody}`);
      }

      // 6. Send PIX button (if configured)
      const pix = pixConfig as BillingConfig | null;
      if (pix?.pix_key && pix?.pix_type) {
        const pixResponse = await fetch(`${apiUrl}/send/pix-button`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            number: phone,
            pixType: pix.pix_type,
            pixKey: pix.pix_key,
            pixName: pix.pix_name || 'Pix',
          }),
        });

        if (!pixResponse.ok) {
          // PIX button failed but text was sent - don't throw, just warn
          console.warn('Falha ao enviar botao PIX:', await pixResponse.text());
        }
      }

      // 7. Register in timeline (company_activities)
      await supabase.from('company_activities' as any).insert({
        lead_id: leadId,
        task_type: 'billing',
        team: 'sales',
        title: `💰 Cobranca Enviada - ${parcela || 'Parcela'}`,
        description: `Cobranca de R$ ${valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '?'} enviada via WhatsApp para ${lead.name}. Vencimento: ${vencimento || '-'}.`,
        status: 'completed',
        metadata: {
          parcela,
          valor,
          vencimento,
          produto,
          phone,
          message,
          pix_sent: !!(pix?.pix_key && pix?.pix_type),
        },
      });

      return await textResponse.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-timeline'] });
    },
  });
}
