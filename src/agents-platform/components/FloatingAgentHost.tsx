/**
 * FloatingAgentHost — monta a(s) bolha(s) de chat flutuante do agente.
 *
 * Lê os deployments com channel='floating' ativos. Cada um tem config:
 *   { route?: string, position?: 'bottom-right'|'bottom-left', button_text?: string }
 * Se `route` está definido, a bolha só aparece nessa rota; senão aparece em todas.
 *
 * Montado uma vez no AppLayout — aparece em qualquer página do CRM.
 */

import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { AgentChatFloating } from './AgentChatFloating';

interface FloatingDeployment {
  id: string;
  config: { route?: string; position?: 'bottom-right' | 'bottom-left'; button_text?: string } | null;
  agents_registry: { slug: string; is_active: boolean } | null;
}

export function FloatingAgentHost() {
  const { pathname } = useLocation();

  const { data: deployments = [] } = useQuery({
    queryKey: ['floating-deployments'],
    queryFn: async (): Promise<FloatingDeployment[]> => {
      const { data } = await supabase
        .from('agents_deployments')
        .select('id, config, agents_registry(slug, is_active)')
        .eq('channel', 'floating')
        .eq('is_active', true);
      return (data as any[]) || [];
    },
    staleTime: 60_000,
  });

  // Não renderiza dentro do próprio módulo de agentes (evita bolha em cima do chat)
  if (pathname.startsWith('/agentes')) return null;

  // Filtra: só bolhas cujo `route` casa com a rota atual (ou sem route = global)
  const visible = deployments.filter((d) => {
    if (!d.agents_registry?.slug || !d.agents_registry?.is_active) return false;
    const route = d.config?.route?.trim();
    if (!route) return true;
    return pathname === route || pathname.startsWith(route + '/');
  });

  // Renderiza no máximo 1 (a 1ª) pra não empilhar bolhas
  const first = visible[0];
  if (!first) return null;

  return (
    <AgentChatFloating
      slug={first.agents_registry!.slug}
      position={first.config?.position || 'bottom-right'}
      buttonText={first.config?.button_text}
    />
  );
}
