/**
 * Serviço de integração com Google Calendar
 * Cria eventos com Google Meet automaticamente
 */

import { supabase } from '@/lib/supabase';

export interface CalendarEventInput {
  title: string;
  description: string;
  startDateTime: string; // ISO string
  durationMinutes: number;
  attendees: string[]; // emails
  organizerEmail: string;
}

export interface CalendarEventResult {
  eventId: string;
  meetLink: string;
  htmlLink: string;
}

/**
 * Cria um evento no Google Calendar com link do Meet
 * 
 * NOTA: Esta função requer autenticação OAuth2 com Google.
 * Para funcionar, você precisa:
 * 1. Criar projeto no Google Cloud Console
 * 2. Habilitar Google Calendar API
 * 3. Configurar OAuth2 credentials
 * 4. Implementar fluxo de autenticação
 * 
 * Por enquanto, esta é uma implementação placeholder que será
 * substituída pela integração real com a API do Google.
 */
export async function createCalendarEvent(
  event: CalendarEventInput,
  teamMemberId: string
): Promise<CalendarEventResult> {
  console.log('📅 Criando evento no Google Calendar:', event);

  // Calcular data de fim baseado na duração
  const startDate = new Date(event.startDateTime);
  const endDate = new Date(startDate.getTime() + event.durationMinutes * 60 * 1000);

  const { data: result, error: invokeError } = await supabase.functions.invoke('create-calendar-event', {
    body: {
      team_member_id: teamMemberId,
      event: {
        summary: event.title,
        description: event.description,
        startDateTime: event.startDateTime,
        endDateTime: endDate.toISOString(),
        attendees: event.attendees,
      },
    },
  });
  if (invokeError) throw invokeError;
  
  if (!result.success) {
    console.error('❌ Erro ao criar evento:', result.error);
    throw new Error(result.error || 'Falha ao criar evento no Google Calendar');
  }
  
  console.log('✅ Evento criado com sucesso:', result);
  
  return {
    eventId: result.eventId,
    meetLink: result.meetLink || '',
    htmlLink: result.htmlLink || '',
  };
}

/**
 * Atualiza um evento existente no Google Calendar (data/hora, convidados, etc.)
 */
export async function updateCalendarEvent(
  eventId: string,
  event: CalendarEventInput,
  teamMemberId: string
): Promise<CalendarEventResult> {
  console.log('📅 Atualizando evento no Google Calendar:', eventId, event);

  const startDate = new Date(event.startDateTime);
  const endDate = new Date(startDate.getTime() + event.durationMinutes * 60 * 1000);

  const { data: result, error: invokeError } = await supabase.functions.invoke('create-calendar-event', {
    body: {
      team_member_id: teamMemberId,
      event_id: eventId, // Sinaliza update ao invés de create
      event: {
        summary: event.title,
        description: event.description,
        startDateTime: event.startDateTime,
        endDateTime: endDate.toISOString(),
        attendees: event.attendees,
      },
    },
  });
  if (invokeError) throw invokeError;

  if (!result.success) {
    console.error('❌ Erro ao atualizar evento:', result.error);
    throw new Error(result.error || 'Falha ao atualizar evento no Google Calendar');
  }

  console.log('✅ Evento atualizado com sucesso:', result);

  return {
    eventId: result.eventId || eventId,
    meetLink: result.meetLink || '',
    htmlLink: result.htmlLink || '',
  };
}

/**
 * Deleta um evento do Google Calendar
 */
export async function deleteCalendarEvent(
  eventId: string,
  teamMemberId: string
): Promise<void> {
  console.log('📅 Deletando evento do Google Calendar:', eventId);

  const { data: result, error: invokeError } = await supabase.functions.invoke('create-calendar-event', {
    body: {
      team_member_id: teamMemberId,
      event_id: eventId,
      action: 'delete',
    },
  });
  if (invokeError) throw invokeError;

  if (!result.success) {
    console.error('❌ Erro ao deletar evento:', result.error);
    throw new Error(result.error || 'Falha ao deletar evento no Google Calendar');
  }

  console.log('✅ Evento deletado com sucesso');
}

/**
 * Gera um ID de Meet no formato do Google
 * Formato: xxx-xxxx-xxx
 */
function generateMeetId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const part1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part3 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part1}-${part2}-${part3}`;
}

/**
 * Formata data/hora para exibição em mensagens
 */
export function formatDateTimeForMessage(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
