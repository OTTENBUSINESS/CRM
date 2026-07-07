/**
 * AgentChatFloating — botão flutuante + painel compacto (PLATAFORMA NOVA).
 *
 * Uso: <AgentChatFloating slug="assistente-geral" />
 */

import { useState } from 'react';
import { useAgent } from '../hooks/useAgent';
import { AgentChat } from './AgentChat';
import { cn } from '@/lib/utils';

export interface AgentChatFloatingProps {
  slug: string;
  channel?: string;
  suggestions?: string[];
  position?: 'bottom-right' | 'bottom-left';
  /** Texto do botão (override) */
  buttonText?: string;
}

export function AgentChatFloating({
  slug,
  channel = 'floating',
  suggestions,
  position = 'bottom-right',
  buttonText,
}: AgentChatFloatingProps) {
  const [open, setOpen] = useState(false);
  const agent = useAgent(slug, channel);

  if (!agent.config) return null;

  const posClass = position === 'bottom-right' ? 'right-6 bottom-6' : 'left-6 bottom-6';
  const emoji = agent.config.emoji || '🤖';
  const label = buttonText || agent.config.display_name;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            'fixed z-40 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full shadow-xl',
            'bg-primary text-white',
            'hover:scale-105 hover:shadow-2xl transition-all',
            posClass
          )}
          title={`Falar com ${agent.config.display_name}`}
        >
          <span className="text-lg">{emoji}</span>
          <span className="text-sm font-medium">{label}</span>
        </button>
      )}

      {open && (
        <div
          className={cn(
            'fixed z-40 shadow-2xl',
            'w-[min(700px,calc(100vw-3rem))] h-[min(720px,calc(100vh-3rem))]',
            posClass
          )}
        >
          <AgentChat
            slug={slug}
            channel={channel}
            compact
            suggestions={suggestions}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}
