/**
 * Serviço de envio de mensagens WhatsApp via UAZAPI
 */

import { supabase } from '@/lib/supabase';

export interface SendWhatsAppMessageInput {
  phone: string; // Número do cliente (ex: 5511999887766)
  message: string;
  instanceName?: string; // Nome da instância UAZAPI
}

export interface SendWhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Busca a instância UAZAPI ativa
 */
async function getActiveInstance(): Promise<{ instanceName: string; apiKey: string; apiUrl: string } | null> {
  const { data, error } = await (supabase as any)
    .from('whatsapp_instances')
    .select('name, api_key, webhook_url')
    .eq('status', 'connected')
    .limit(1)
    .single();

  if (error || !data) {
    console.error('Nenhuma instância WhatsApp conectada:', error);
    return null;
  }

  return {
    instanceName: data.name,
    apiKey: data.api_key,
    apiUrl: data.webhook_url || 'https://api.uazapi.com',
  };
}

/**
 * Formata número de telefone para o formato do WhatsApp
 */
function formatPhoneForWhatsApp(phone: string): string {
  // Remove caracteres não numéricos
  let cleaned = phone.replace(/\D/g, '');
  // Números BR sem código de país: 10-11 dígitos (DDD + 8-9 dígitos)
  // Números internacionais já com código: 12+ dígitos
  // Só adiciona 55 se parecer ser BR sem código (até 11 dígitos)
  if (!cleaned.startsWith('55') && cleaned.length <= 11) {
    cleaned = `55${cleaned}`;
  }
  // Adiciona sufixo do WhatsApp
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Envia mensagem de texto via WhatsApp
 */
export async function sendWhatsAppMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppResult> {
  try {
    const instance = await getActiveInstance();
    
    if (!instance) {
      return {
        success: false,
        error: 'Nenhuma instância WhatsApp conectada',
      };
    }

    const chatId = formatPhoneForWhatsApp(input.phone);

    const response = await fetch(`${instance.apiUrl}/send_message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instance.apiKey}`,
      },
      body: JSON.stringify({
        instanceName: input.instanceName || instance.instanceName,
        chatId,
        message: input.message,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.message || 'Erro ao enviar mensagem',
      };
    }

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error('Erro ao enviar WhatsApp:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Gera mensagem de confirmação de agendamento
 */
export function generateScheduleConfirmationMessage(params: {
  clientName: string;
  dateTime: string;
  meetLink: string;
  productName?: string;
}): string {
  const date = new Date(params.dateTime);
  const formattedDate = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const formattedTime = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `Olá ${params.clientName}! 👋

Sua call de onboarding${params.productName ? ` do ${params.productName}` : ''} está confirmada! ✅

📅 *Data:* ${formattedDate}
⏰ *Horário:* ${formattedTime}
🔗 *Link da reunião:* ${params.meetLink}

Qualquer dúvida, é só chamar aqui! 😊`;
}
