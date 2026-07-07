/**
 * TabRegras — workflow rules do agente (gatilho → ação).
 *
 * Edita draft.settings.workflow_rules[] (array no JSONB).
 *
 * Schema de cada regra:
 * {
 *   id: string,
 *   name: string,
 *   is_active: boolean,
 *   trigger: {
 *     event: 'message_received' | 'tool_result' | 'time_elapsed' | 'stage_changed',
 *     keyword_match?: string,        // regex case-insensitive
 *     tool_name?: string,             // se event=tool_result
 *     hours?: number,                 // se event=time_elapsed
 *     min_messages?: number           // só dispara depois de N msgs
 *   },
 *   action: {
 *     type: 'notify_human' | 'run_tool' | 'change_stage' | 'pause_agent' | 'tag_lead',
 *     config: Record<string, any>     // depende do type
 *   },
 *   cooldown_minutes: number,
 *   max_per_day_per_lead: number
 * }
 *
 * Salvar = persistido só quando o usuário clica "Publicar versão" no header
 * (mesmo fluxo dos outros tabs — saveDraft + publish).
 */

import { useState } from 'react';
import { Plus, Trash2, Pencil, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AgentConfig } from '../hooks/useAgentConfig';

interface WorkflowRule {
  id: string;
  name: string;
  is_active: boolean;
  trigger: {
    event: 'message_received' | 'tool_result' | 'time_elapsed' | 'stage_changed';
    keyword_match?: string;
    tool_name?: string;
    hours?: number;
    min_messages?: number;
  };
  action: {
    type: 'notify_human' | 'run_tool' | 'change_stage' | 'pause_agent' | 'tag_lead';
    config: Record<string, any>;
  };
  cooldown_minutes?: number;
  max_per_day_per_lead?: number;
}

interface Props {
  draft: Partial<AgentConfig>;
  setDraft: (fn: (prev: Partial<AgentConfig>) => Partial<AgentConfig>) => void;
}

const EVENT_LABELS: Record<WorkflowRule['trigger']['event'], string> = {
  message_received: '💬 Lead enviou mensagem',
  tool_result: '🛠 Tool executou',
  time_elapsed: '⏱ Tempo passou',
  stage_changed: '➡ Stage mudou',
};

const ACTION_LABELS: Record<WorkflowRule['action']['type'], string> = {
  notify_human: '🔔 Notificar humano',
  run_tool: '🔧 Executar tool',
  change_stage: '➡ Mudar stage',
  pause_agent: '⏸ Pausar agente',
  tag_lead: '🏷 Tag no lead',
};

function newRule(): WorkflowRule {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: 'Nova regra',
    is_active: true,
    trigger: { event: 'message_received' },
    action: { type: 'notify_human', config: { group: 'comercial' } },
    cooldown_minutes: 60,
    max_per_day_per_lead: 1,
  };
}

export function TabRegras({ draft, setDraft }: Props) {
  const settings = (draft.settings || {}) as Record<string, any>;
  const rules: WorkflowRule[] = Array.isArray(settings.workflow_rules) ? settings.workflow_rules : [];

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const updateRules = (newRules: WorkflowRule[]) => {
    setDraft((prev) => ({
      ...prev,
      settings: {
        ...((prev.settings as Record<string, any>) || {}),
        workflow_rules: newRules,
      },
    }));
  };

  const add = () => {
    const r = newRule();
    updateRules([...rules, r]);
    setExpandedId(r.id);
  };

  const remove = (id: string) => {
    if (!confirm('Apagar essa regra?')) return;
    updateRules(rules.filter((r) => r.id !== id));
  };

  const toggle = (id: string) => {
    updateRules(rules.map((r) => (r.id === id ? { ...r, is_active: !r.is_active } : r)));
  };

  const update = (id: string, patch: Partial<WorkflowRule>) => {
    updateRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-medium">Regras de workflow</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Quando ACONTECER X → faz Y. Aplicado durante a conversa do agente.
            Lembra de clicar <strong>"Publicar versão"</strong> no header pra salvar.
          </p>
        </div>
        <Button size="sm" onClick={add} className="bg-primary hover:bg-primary text-white gap-1.5">
          <Plus className="h-4 w-4" />
          Nova regra
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-8 text-center">
          <Zap className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma regra configurada ainda.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Clica em "Nova regra" pra criar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              expanded={expandedId === r.id}
              onExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
              onToggle={() => toggle(r.id)}
              onRemove={() => remove(r.id)}
              onUpdate={(patch) => update(r.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule, expanded, onExpand, onToggle, onRemove, onUpdate,
}: {
  rule: WorkflowRule;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<WorkflowRule>) => void;
}) {
  return (
    <div className={cn(
      'border rounded-xl bg-card overflow-hidden',
      rule.is_active ? 'border-border' : 'border-border opacity-60',
    )}>
      {/* Header sempre visível */}
      <button
        onClick={onExpand}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {rule.is_active ? (
            <Badge variant="outline" className="h-5 text-[10px] border-emerald-500/30 text-emerald-600 gap-1 shrink-0">
              <span className="h-1 w-1 rounded-full bg-emerald-500" /> Ativa
            </Badge>
          ) : (
            <Badge variant="outline" className="h-5 text-[10px] shrink-0">Pausada</Badge>
          )}
          <span className="font-medium text-sm truncate">{rule.name || '(sem nome)'}</span>
        </div>
        <span className="text-[11px] text-muted-foreground hidden md:inline">
          {EVENT_LABELS[rule.trigger.event]?.split(' ')[0]} → {ACTION_LABELS[rule.action.type]?.split(' ')[0]}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* Editor expandido */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-4 bg-muted/10">
          {/* Nome */}
          <div>
            <Label className="text-xs">Nome da regra</Label>
            <Input
              value={rule.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder='Ex: Lead disse "caro" → handoff Closer'
              className="mt-1 h-8 text-sm"
            />
          </div>

          {/* TRIGGER */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <h4 className="text-xs font-semibold text-orange-700 dark:text-primary uppercase tracking-wider mb-2">
              ⚡ Quando (gatilho)
            </h4>
            <div className="space-y-2">
              <div>
                <Label className="text-[11px]">Evento</Label>
                <select
                  value={rule.trigger.event}
                  onChange={(e) =>
                    onUpdate({ trigger: { ...rule.trigger, event: e.target.value as WorkflowRule['trigger']['event'] } })
                  }
                  className="mt-1 w-full h-8 border border-input bg-background rounded-md px-2 text-xs"
                >
                  {Object.entries(EVENT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {rule.trigger.event === 'message_received' && (
                <>
                  <div>
                    <Label className="text-[11px]">Palavras-chave (regex)</Label>
                    <Input
                      value={rule.trigger.keyword_match || ''}
                      onChange={(e) =>
                        onUpdate({ trigger: { ...rule.trigger, keyword_match: e.target.value } })
                      }
                      placeholder="caro|preço|valor|orçamento"
                      className="mt-1 h-8 text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Regex case-insensitive. Use <code>|</code> pra OR.
                    </p>
                  </div>
                  <div>
                    <Label className="text-[11px]">Só dispara depois de N mensagens (opcional)</Label>
                    <Input
                      type="number" min={0}
                      value={rule.trigger.min_messages ?? ''}
                      onChange={(e) =>
                        onUpdate({
                          trigger: {
                            ...rule.trigger,
                            min_messages: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="3"
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                </>
              )}

              {rule.trigger.event === 'tool_result' && (
                <div>
                  <Label className="text-[11px]">Tool name</Label>
                  <Input
                    value={rule.trigger.tool_name || ''}
                    onChange={(e) =>
                      onUpdate({ trigger: { ...rule.trigger, tool_name: e.target.value } })
                    }
                    placeholder="qualify_lead"
                    className="mt-1 h-8 text-xs font-mono"
                  />
                </div>
              )}

              {rule.trigger.event === 'time_elapsed' && (
                <div>
                  <Label className="text-[11px]">Horas sem resposta</Label>
                  <Input
                    type="number" min={1}
                    value={rule.trigger.hours ?? 24}
                    onChange={(e) =>
                      onUpdate({ trigger: { ...rule.trigger, hours: Number(e.target.value) } })
                    }
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ACTION */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
            <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-2">
              🎯 O que faz (ação)
            </h4>
            <div className="space-y-2">
              <div>
                <Label className="text-[11px]">Tipo</Label>
                <select
                  value={rule.action.type}
                  onChange={(e) =>
                    onUpdate({ action: { type: e.target.value as WorkflowRule['action']['type'], config: {} } })
                  }
                  className="mt-1 w-full h-8 border border-input bg-background rounded-md px-2 text-xs"
                >
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {rule.action.type === 'notify_human' && (
                <>
                  <div>
                    <Label className="text-[11px]">Grupo / responsável</Label>
                    <Input
                      value={rule.action.config.group || ''}
                      onChange={(e) =>
                        onUpdate({ action: { ...rule.action, config: { ...rule.action.config, group: e.target.value } } })
                      }
                      placeholder="comercial / cs / sócios"
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Mensagem (suporta {`{{lead_name}}, {{matched_keyword}}`})</Label>
                    <Textarea
                      value={rule.action.config.message || ''}
                      onChange={(e) =>
                        onUpdate({ action: { ...rule.action, config: { ...rule.action.config, message: e.target.value } } })
                      }
                      placeholder="Lead {{lead_name}} disse '{{matched_keyword}}' — assume aí"
                      className="mt-1 text-xs"
                      rows={2}
                    />
                  </div>
                </>
              )}

              {rule.action.type === 'run_tool' && (
                <>
                  <div>
                    <Label className="text-[11px]">Tool a executar</Label>
                    <Input
                      value={rule.action.config.tool || ''}
                      onChange={(e) =>
                        onUpdate({ action: { ...rule.action, config: { ...rule.action.config, tool: e.target.value } } })
                      }
                      placeholder="mark_deal_lost / send_template"
                      className="mt-1 h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Args (JSON)</Label>
                    <Textarea
                      value={JSON.stringify(rule.action.config.args || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          const args = JSON.parse(e.target.value);
                          onUpdate({ action: { ...rule.action, config: { ...rule.action.config, args } } });
                        } catch { /* ignora JSON inválido durante digitação */ }
                      }}
                      placeholder='{"reason": "preço fora do orçamento"}'
                      className="mt-1 text-xs font-mono"
                      rows={3}
                    />
                  </div>
                </>
              )}

              {rule.action.type === 'change_stage' && (
                <div>
                  <Label className="text-[11px]">Stage destino (nome)</Label>
                  <Input
                    value={rule.action.config.stage_name || ''}
                    onChange={(e) =>
                      onUpdate({ action: { ...rule.action, config: { ...rule.action.config, stage_name: e.target.value } } })
                    }
                    placeholder="Em Negociação"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              )}

              {rule.action.type === 'tag_lead' && (
                <div>
                  <Label className="text-[11px]">Tag (texto livre)</Label>
                  <Input
                    value={rule.action.config.tag || ''}
                    onChange={(e) =>
                      onUpdate({ action: { ...rule.action, config: { ...rule.action.config, tag: e.target.value } } })
                    }
                    placeholder="objecao_preco"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              )}

              {rule.action.type === 'pause_agent' && (
                <p className="text-[11px] text-muted-foreground italic">
                  Pausa esta conversa específica. Vendedor precisa retomar manualmente no inbox.
                </p>
              )}
            </div>
          </div>

          {/* Safety */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Cooldown (min)</Label>
              <Input
                type="number" min={0}
                value={rule.cooldown_minutes ?? 60}
                onChange={(e) => onUpdate({ cooldown_minutes: Number(e.target.value) })}
                className="mt-1 h-8 text-xs"
              />
              <p className="text-[9px] text-muted-foreground mt-0.5">não dispara 2× no mesmo lead em X min</p>
            </div>
            <div>
              <Label className="text-[11px]">Máx por dia/lead</Label>
              <Input
                type="number" min={1}
                value={rule.max_per_day_per_lead ?? 1}
                onChange={(e) => onUpdate({ max_per_day_per_lead: Number(e.target.value) })}
                className="mt-1 h-8 text-xs"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 text-xs">
              {rule.is_active ? 'Pausar' : 'Ativar'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onRemove} className="h-7 text-xs text-red-500 hover:text-red-600 gap-1">
              <Trash2 className="h-3.5 w-3.5" />
              Apagar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
