// Helpers do módulo LiveKit (sala própria de videochamada)

/** Gera um nome de sala único (usado em meetings.livekit_room_name e na URL /meet/:roomId) */
export function generateRoomName(): string {
  return `meeting-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface MeetUrlOptions {
  role?: 'host' | 'guest' | 'observer';
  leadId?: string;
  orgId?: string;
  name?: string;
}

/**
 * Monta o link da sala própria.
 * SEMPRE usa a URL de produção (mesmo em dev) — senão o lead recebe link localhost
 * e não consegue acessar (gotcha 8 do acelerador LiveKit).
 */
export function getMeetUrl(roomName: string, opts?: MeetUrlOptions): string {
  const baseUrl = 'https://crm-beta-gilt-40.vercel.app';
  const params = new URLSearchParams();
  if (opts?.role) params.set('role', opts.role);
  if (opts?.leadId) params.set('lead_id', opts.leadId);
  if (opts?.orgId) params.set('org_id', opts.orgId);
  if (opts?.name) params.set('name', opts.name);
  const qs = params.toString();
  return `${baseUrl}/meet/${roomName}${qs ? '?' + qs : ''}`;
}

/** Extrai o roomName de um meeting_link no formato .../meet/<roomName>?... (null se não for sala própria) */
export function extractRoomNameFromLink(link?: string | null): string | null {
  if (!link) return null;
  const match = link.match(/\/meet\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

/** True se o link aponta pra sala própria do CRM (LiveKit) */
export function isLiveKitLink(link?: string | null): boolean {
  return !!extractRoomNameFromLink(link);
}
