/**
 * TabHumanizacao — config de humanização do agente.
 *
 * Edita draft.settings.humanization. Persistido quando o usuário clica "Publicar versão"
 * (mesmo fluxo dos outros tabs).
 *
 * Shape:
 * {
 *   enabled: boolean,
 *   channels: string[],
 *   debounce_seconds: number,
 *   response_delay_min_ms: number,
 *   response_delay_max_ms: number,
 *   typing_indicator: boolean,
 *   message_split: {
 *     enabled: boolean,
 *     max_chars: number,
 *     delay_between_min_ms: number,
 *     delay_between_max_ms: number
 *   }
 * }
 */

import { Brain, MessageSquare, Send, Instagram, Layers, Sidebar, Mail, Clock, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { AgentConfig } from '../hooks/useAgentConfig';

const HUMANIZABLE_CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: Send, recommended: true },
  { id: 'telegram', label: 'Telegram', icon: Send, recommended: true },
  { id: 'instagram', label: 'Instagram', icon: Instagram, recommended: true },
];

const NON_HUMANIZABLE = [
  { id: 'chat_web', label: 'Chat web', icon: MessageSquare },
  { id: 'floating', label: 'Botão flutuante', icon: MessageCircle },
  { id: 'sidebar', label: 'Sidebar', icon: Sidebar },
  { id: 'inbox', label: 'Inbox copiloto', icon: Layers },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'cron', label: 'Cron', icon: Clock },
];

const DEFAULT_HUMANIZATION = {
  enabled: false,
  channels: ['whatsapp', 'telegram', 'instagram'],
  debounce_seconds: 20,
  response_delay_min_ms: 2000,
  response_delay_max_ms: 5000,
  typing_indicator: true,
  message_split: {
    enabled: true,
    max_chars: 200,
    delay_between_min_ms: 1500,
    delay_between_max_ms: 3000,
  },
};

interface Props {
  draft: Partial<AgentConfig>;
  setDraft: (fn: (prev: Partial<AgentConfig>) => Partial<AgentConfig>) => void;
}

export function TabHumanizacao({ draft, setDraft }: Props) {
  const settings = (draft.settings || {}) as Record<string, any>;
  const h = { ...DEFAULT_HUMANIZATION, ...(settings.humanization || {}) };
  h.message_split = { ...DEFAULT_HUMANIZATION.message_split, ...(h.message_split || {}) };

  const update = (patch: Record<string, any>) => {
    setDraft((prev) => ({
      ...prev,
      settings: {
        ...((prev.settings as Record<string, any>) || {}),
        humanization: { ...h, ...patch },
      },
    }));
  };

  const updateSplit = (patch: Record<string, any>) => {
    update({ message_split: { ...h.message_split, ...patch } });
  };

  const toggleChannel = (channelId: string) => {
    const next = h.channels.includes(channelId)
      ? h.channels.filter((c: string) => c !== channelId)
      : [...h.channels, channelId];
    update({ channels: next });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-medium">Humanização</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Faz o agente parecer humano nas conversas: agrupa mensagens recebidas, espera antes de
              responder, quebra resposta longa em várias. Lembra de clicar <strong>"Publicar versão"</strong>{' '}
              no header pra salvar.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={h.enabled} onCheckedChange={(v) => update({ enabled: v })} />
          <span className="text-xs font-medium">{h.enabled ? 'Ativado' : 'Desativado'}</span>
        </div>
      </div>

      {!h.enabled && (
        <div className="border border-dashed border-border rounded-xl p-6 text-center bg-muted/20">
          <p className="text-sm text-muted-foreground">
            Humanização <strong>desativada</strong>. Agente responde imediatamente em todos os canais.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">
            Ative se for atender clientes finais por WhatsApp / Telegram / Instagram.
          </p>
        </div>
      )}

      {h.enabled && (
        <>
          {/* Canais aplicáveis */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Aplicar nos canais
            </h4>

            <div className="grid sm:grid-cols-3 gap-2">
              {HUMANIZABLE_CHANNELS.map((c) => {
                const Icon = c.icon;
                const checked = h.channels.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleChannel(c.id)}
                    className={cn(
                      'flex items-center gap-2 p-3 border rounded-lg text-left transition-all',
                      checked
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-border hover:border-primary/30 hover:bg-muted/30',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', checked ? 'text-emerald-600' : 'text-muted-foreground')} />
                    <span className="text-sm font-medium flex-1">{c.label}</span>
                    {checked && <span className="text-emerald-600 text-base leading-none">✓</span>}
                  </button>
                );
              })}
            </div>

            <div className="border border-border/50 rounded-lg p-3 bg-muted/20">
              <p className="text-[11px] font-medium text-muted-foreground mb-2">
                Canais que NUNCA humanizam (por natureza):
              </p>
              <div className="flex flex-wrap gap-2">
                {NON_HUMANIZABLE.map((c) => {
                  const Icon = c.icon;
                  return (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-muted text-muted-foreground rounded border border-border/50"
                    >
                      <Icon className="h-3 w-3" />
                      {c.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Debounce */}
          <section className="rounded-xl border border-border p-4 space-y-3 bg-card">
            <div>
              <h4 className="text-sm font-medium">⏳ Agrupamento (debounce)</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Espera o lead terminar de digitar antes de responder. Ex: "oi" + "td?" + "queria saber"
                em 5s → vira 1 contexto só.
              </p>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-[11px]">Janela (segundos)</Label>
                <Input
                  type="number" min={0} max={120}
                  value={h.debounce_seconds}
                  onChange={(e) => update({ debounce_seconds: Number(e.target.value) || 0 })}
                  className="mt-1 h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  0 = sem debounce. Recomendado: 15-25s pra WhatsApp.
                </p>
              </div>
            </div>
          </section>

          {/* Response delay */}
          <section className="rounded-xl border border-border p-4 space-y-3 bg-card">
            <div>
              <h4 className="text-sm font-medium">⏱ Delay antes de responder</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Simula tempo de leitura. Aleatório dentro do range.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Min (ms)</Label>
                <Input
                  type="number" min={0}
                  value={h.response_delay_min_ms}
                  onChange={(e) => update({ response_delay_min_ms: Number(e.target.value) || 0 })}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-[11px]">Max (ms)</Label>
                <Input
                  type="number" min={0}
                  value={h.response_delay_max_ms}
                  onChange={(e) => update({ response_delay_max_ms: Number(e.target.value) || 0 })}
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Recomendado: 2000-5000ms (2-5s). Muito rápido parece robô; muito lento, lead acha que sumiu.
            </p>
          </section>

          {/* Typing indicator */}
          <section className="rounded-xl border border-border p-4 bg-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium">⌨️ Indicador "digitando..."</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Envia status de "digitando" pro lead enquanto processa. Funciona melhor no Telegram;
                  no WhatsApp Cloud é em beta.
                </p>
              </div>
              <Switch
                checked={h.typing_indicator}
                onCheckedChange={(v) => update({ typing_indicator: v })}
              />
            </div>
          </section>

          {/* Message split */}
          <section className="rounded-xl border border-border p-4 space-y-3 bg-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium">📩 Quebrar resposta longa em várias mensagens</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Se passar de N caracteres ou tiver quebra dupla (\n\n), quebra em mensagens separadas
                  com delays entre cada.
                </p>
              </div>
              <Switch
                checked={h.message_split.enabled}
                onCheckedChange={(v) => updateSplit({ enabled: v })}
              />
            </div>

            {h.message_split.enabled && (
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div>
                  <Label className="text-[11px]">Max chars/parte</Label>
                  <Input
                    type="number" min={50}
                    value={h.message_split.max_chars}
                    onChange={(e) => updateSplit({ max_chars: Number(e.target.value) || 200 })}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Delay min (ms)</Label>
                  <Input
                    type="number" min={0}
                    value={h.message_split.delay_between_min_ms}
                    onChange={(e) => updateSplit({ delay_between_min_ms: Number(e.target.value) || 0 })}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Delay max (ms)</Label>
                  <Input
                    type="number" min={0}
                    value={h.message_split.delay_between_max_ms}
                    onChange={(e) => updateSplit({ delay_between_max_ms: Number(e.target.value) || 0 })}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
