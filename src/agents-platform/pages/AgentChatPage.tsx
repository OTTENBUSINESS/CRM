/**
 * AgentChatPage — rota fullscreen pra qualquer agente da plataforma nova.
 * Rota: /agentes/:slug
 */

import { useParams, Navigate } from 'react-router-dom';
import { AgentChat } from '../components/AgentChat';

export default function AgentChatPage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate to="/agentes" replace />;

  return (
    <div className="h-[100dvh] bg-background overflow-hidden p-4">
      <AgentChat slug={slug} channel="chat_web" fullscreen />
    </div>
  );
}
