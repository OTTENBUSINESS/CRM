/**
 * ToolEditDrawer — editor de HABILIDADE do agente em linguagem natural.
 *
 * Filosofia UX:
 *   - Zero jargão técnico no modo padrão (sem "params_map", "RPC", "schema")
 *   - 3 perguntas: "Pra que serve?" → "O que precisa perguntar?" → "O que faz?"
 *   - "Modo avançado" expõe JSON pra dev customizar
 *
 * Por trás (best practice Anthropic SDK):
 *   - LLM passa dados de negócio → vira `parameters_schema`
 *   - Sistema injeta lead_id, deal_id, etc automaticamente (sem aparecer pro LLM)
 *   - Auto-link por convenção: campo "faturamento" → param SQL p_faturamento
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  X, Trash2, Loader2, Plus, Code,
  HelpCircle, Wrench, MessageCircle, Database, Globe, Webhook, Sparkles,
  Info, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { useAgentTools, type AgentTool } from '../hooks/useAgentTools';
import { cn } from '@/lib/utils';

// "Variáveis do sistema" em linguagem natural
const SYSTEM_HELPERS = [
  { key: 'lead_id', label: 'Contato da conversa', desc: 'Quem está conversando com o agente agora', icon: '👤' },
  { key: 'deal_id', label: 'Oportunidade do contato', desc: 'Negócio ativo desse contato no funil', icon: '💼' },
  { key: 'activity_id', label: 'Reunião em foco', desc: 'Quando falando de reunião específica', icon: '📅' },
  { key: 'agent_id', label: 'Identidade do agente', desc: 'Pra registrar quem fez o quê', icon: '🤖' },
  { key: 'session_id', label: 'Sessão atual', desc: 'Conversa em andamento', icon: '💬' },
  { key: 'user_id', label: 'Vendedor logado', desc: 'Quando rodando dentro do CRM', icon: '👔' },
  { key: 'channel', label: 'Canal de origem', desc: 'WhatsApp, Telegram, Chat web, etc', icon: '📡' },
  { key: 'instance_id', label: 'Número do WhatsApp', desc: 'Qual número recebeu a mensagem', icon: '📱' },
];

const ACTION_TYPE_LABELS: Record<AgentTool['action_type'], { label: string; desc: string; icon: any }> = {
  sql: { label: 'Ação no banco', desc: 'Cria/atualiza dados do CRM (lead, deal, reunião…)', icon: Database },
  http: { label: 'Chamar API externa', desc: 'Faz request HTTP pra outro sistema', icon: Globe },
  webhook: { label: 'Disparar webhook', desc: 'Avisa sistema externo (Zapier, n8n…)', icon: Webhook },
  edge_function: { label: 'Função customizada', desc: 'Chama outra função do Supabase', icon: Wrench },
};

interface Props {
  agentId: string;
  tool?: AgentTool | null;
  onClose: () => void;
}

type FieldType = 'texto' | 'numero' | 'verdadeiro_falso' | 'lista_opcoes';

type Field = {
  name: string;
  type: FieldType;
  description?: string;
  required: boolean;
  options?: string[];
};

const FIELD_TYPES: Array<{ id: FieldType; label: string; jsonType: string }> = [
  { id: 'texto', label: 'Texto', jsonType: 'string' },
  { id: 'numero', label: 'Número', jsonType: 'number' },
  { id: 'verdadeiro_falso', label: 'Sim/Não', jsonType: 'boolean' },
  { id: 'lista_opcoes', label: 'Lista de opções', jsonType: 'string' },
];

export function ToolEditDrawer({ agentId, tool, onClose }: Props) {
  const { saveTool, isSaving, deleteTool } = useAgentTools(agentId);
  const isNew = !tool?.id;

  const [name, setName] = useState(tool?.name || '');
  const [description, setDescription] = useState(tool?.description || '');
  const [actionType, setActionType] = useState<AgentTool['action_type']>(tool?.action_type || 'sql');

  const initialSchema = tool?.parameters_schema as any;
  const [fields, setFields] = useState<Field[]>(() => parseSchemaToFields(initialSchema));

  const initialConfig = (tool?.action_config as any) || getDefaultConfig('sql');
  const [actionConfigText, setActionConfigText] = useState(JSON.stringify(initialConfig, null, 2));

  // SQL: nome da função + helpers selecionados
  const [sqlFunctionName, setSqlFunctionName] = useState(initialConfig?.function || '');
  const initialHelpers = parseHelpersFromParamsMap(initialConfig?.params_map || {});
  const [activeHelpers, setActiveHelpers] = useState<Set<string>>(new Set(initialHelpers));

  const [advancedMode, setAdvancedMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tool) {
      setActionConfigText(JSON.stringify(getDefaultConfig(actionType), null, 2));
      if (actionType === 'sql') {
        const def = getDefaultConfig('sql') as any;
        setSqlFunctionName(def.function);
        setActiveHelpers(new Set(parseHelpersFromParamsMap(def.params_map)));
      }
    }
  }, [actionType, tool]);

  const builtSchema = useMemo(() => buildSchemaFromFields(fields), [fields]);
  const builtConfig = useMemo(() => {
    if (actionType !== 'sql') {
      try { return JSON.parse(actionConfigText); } catch { return {}; }
    }
    // Auto-monta params_map: helpers ativados + campos do form
    const params_map: Record<string, string> = {};
    for (const helperKey of activeHelpers) {
      params_map[`p_${helperKey}`] = `{{${helperKey}}}`;
    }
    for (const f of fields) {
      if (f.name.trim()) params_map[`p_${f.name}`] = `{{${f.name}}}`;
    }
    return { function: sqlFunctionName, params_map };
  }, [actionType, sqlFunctionName, activeHelpers, fields, actionConfigText]);

  const onSave = () => {
    setError(null);
    if (!name.trim() || !/^[a-z_][a-z0-9_]*$/i.test(name)) {
      setError('Nome em código inválido (só letras minúsculas, números, underscore)'); return;
    }
    let finalConfig: Record<string, unknown>;
    try {
      finalConfig = actionType === 'sql' && !advancedMode ? builtConfig : JSON.parse(actionConfigText);
    } catch {
      setError('Configuração técnica com JSON inválido'); return;
    }

    saveTool(
      {
        agent_id: agentId,
        id: tool?.id,
        name: name.trim(),
        description: description.trim(),
        parameters_schema: builtSchema,
        action_type: actionType,
        action_config: finalConfig,
        usage_mode: tool?.usage_mode || 'always',
      } as any,
      { onSuccess: () => onClose() },
    );
  };

  const onDelete = () => {
    if (!tool?.id || !confirm(`Apagar habilidade "${tool.name}"?`)) return;
    deleteTool(tool.id, { onSuccess: () => onClose() });
  };

  const toggleHelper = (key: string) => {
    setActiveHelpers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-[min(720px,100vw)] bg-background border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="min-w-0 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {isNew ? 'Nova habilidade' : `Editando: ${tool?.name}`}
              </h2>
              <p className="text-xs text-muted-foreground">
                Define algo que o agente pode fazer além de só conversar
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* ─── PASSO 1: PRA QUE SERVE? ─── */}
          <Section
            num={1}
            title="Pra que serve essa habilidade?"
            subtitle="O agente lê isso pra decidir quando usar"
          >
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nome em código</Label>
                <Input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="qualificar_lead"
                  disabled={!isNew}
                  className="mt-1 font-mono text-sm h-9"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Só letras minúsculas e <code>_</code>. Não pode mudar depois.
                </p>
              </div>
              <div>
                <Label className="text-xs">Quando usar (descrição)</Label>
                <Textarea
                  rows={2}
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  className="mt-1"
                  placeholder='"Use depois que o lead falar quanto fatura, quem decide e quando quer resolver."'
                />
              </div>
            </div>
          </Section>

          {/* ─── PASSO 2: O QUE O AGENTE PRECISA PERGUNTAR? ─── */}
          <Section
            num={2}
            title="O que o agente precisa perguntar?"
            subtitle="Informações que vêm da conversa (não use IDs internos — esses vêm do passo 3)"
          >
            <FieldsEditor fields={fields} onChange={setFields} />
          </Section>

          {/* ─── PASSO 3: O QUE ACONTECE QUANDO EXECUTAR? ─── */}
          <Section
            num={3}
            title="O que acontece quando o agente usa?"
            subtitle="Define a ação executada quando o agente decidir chamar"
          >
            {/* Tipo de ação */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(Object.entries(ACTION_TYPE_LABELS) as Array<[AgentTool['action_type'], typeof ACTION_TYPE_LABELS[keyof typeof ACTION_TYPE_LABELS]]>).map(([type, info]) => {
                const Icon = info.icon;
                return (
                  <button
                    key={type}
                    onClick={() => setActionType(type)}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      actionType === type
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30',
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={cn('h-4 w-4', actionType === type ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-sm font-medium">{info.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{info.desc}</p>
                  </button>
                );
              })}
            </div>

            {actionType === 'sql' && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs flex items-center gap-1.5">
                    Nome da ação no banco
                    <span title="Nome da function Postgres que executa essa habilidade" className="cursor-help">
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </Label>
                  <Input
                    value={sqlFunctionName} onChange={(e) => setSqlFunctionName(e.target.value)}
                    placeholder="agent_qualify_lead"
                    className="mt-1 font-mono text-sm h-9"
                  />
                  <FunctionDescription fnName={sqlFunctionName} />
                </div>

                {/* Helpers automáticos */}
                <div>
                  <Label className="text-xs">O que o agente já sabe sozinho (ative pra usar)</Label>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    O sistema preenche automaticamente, sem o agente precisar perguntar
                  </p>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {SYSTEM_HELPERS.map((h) => {
                      const active = activeHelpers.has(h.key);
                      return (
                        <button
                          key={h.key}
                          onClick={() => toggleHelper(h.key)}
                          className={cn(
                            'p-2 rounded-md border text-left transition-all',
                            active
                              ? 'border-emerald-500/40 bg-emerald-500/5'
                              : 'border-border hover:border-emerald-500/20',
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-base leading-none">{h.icon}</span>
                            <span className="text-xs font-medium">{h.label}</span>
                            {active && <span className="text-emerald-600 ml-auto text-base leading-none">✓</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 ml-6">{h.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Modo avançado (JSON) */}
                <details className="rounded-lg border border-border p-3 bg-muted/20">
                  <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1.5">
                    <Code className="h-3 w-3" />
                    Modo avançado — ver/editar config técnica
                  </summary>
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] text-muted-foreground">
                      Auto-gerado a partir dos campos acima. Edita só se precisar de mapeamento custom.
                    </p>
                    <Textarea
                      rows={8}
                      value={advancedMode ? actionConfigText : JSON.stringify(builtConfig, null, 2)}
                      onChange={(e) => { setActionConfigText(e.target.value); setAdvancedMode(true); }}
                      className="font-mono text-[11px]"
                    />
                    {advancedMode && (
                      <button
                        onClick={() => { setAdvancedMode(false); setActionConfigText(JSON.stringify(builtConfig, null, 2)); }}
                        className="text-[10px] text-primary hover:underline"
                      >
                        ↺ Voltar pra modo automático
                      </button>
                    )}
                  </div>
                </details>
              </div>
            )}

            {actionType !== 'sql' && (
              <div>
                <Label className="text-xs">Configuração técnica</Label>
                <Textarea
                  rows={10}
                  value={actionConfigText}
                  onChange={(e) => setActionConfigText(e.target.value)}
                  className="mt-1 font-mono text-[11px]"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {getConfigHint(actionType)}
                </p>
              </div>
            )}
          </Section>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card flex items-center justify-between gap-2">
          {!isNew && (
            <Button variant="outline" size="sm" onClick={onDelete} className="text-red-600 hover:text-red-700 hover:bg-red-500/5">
              <Trash2 className="h-4 w-4 mr-1.5" />
              Apagar
            </Button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button
              size="sm" onClick={onSave} disabled={isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar habilidade'}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Section wrapper (passo numerado)
// ─────────────────────────────────────────────────────────
function Section({
  num, title, subtitle, children,
}: { num: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
          {num}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="pl-10">{children}</div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// FieldsEditor (campos que o agente precisa perguntar)
// ─────────────────────────────────────────────────────────
function FieldsEditor({
  fields, onChange,
}: { fields: Field[]; onChange: (f: Field[]) => void }) {
  const update = (i: number, patch: Partial<Field>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const add = () => onChange([...fields, { name: '', type: 'texto', required: false }]);

  if (fields.length === 0) {
    return (
      <div className="text-center py-6 border border-dashed border-border rounded-lg">
        <MessageCircle className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground mb-3">Nenhum campo ainda — habilidade roda sem perguntar nada</p>
        <Button size="sm" variant="outline" onClick={add} className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Adicionar pergunta
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-background">
          <div className="grid grid-cols-12 gap-2 items-start">
            <div className="col-span-4">
              <Label className="text-[10px] text-muted-foreground">Nome</Label>
              <Input
                placeholder="faturamento"
                value={f.name}
                onChange={(e) => update(i, { name: e.target.value })}
                className="mt-0.5 h-8 text-xs font-mono"
              />
            </div>
            <div className="col-span-3">
              <Label className="text-[10px] text-muted-foreground">Tipo</Label>
              <select
                value={f.type}
                onChange={(e) => update(i, { type: e.target.value as FieldType })}
                className="mt-0.5 w-full h-8 border border-input bg-background rounded-md px-2 text-xs"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-4 flex items-end h-full">
              <label className="flex items-center gap-1.5 text-[11px] pb-1.5">
                <input
                  type="checkbox" checked={f.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                  className="h-3 w-3"
                />
                obrigatório
              </label>
            </div>
            <Button
              size="icon" variant="ghost"
              className="col-span-1 h-8 w-8 text-red-500 hover:text-red-600 mt-5"
              onClick={() => remove(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Input
            placeholder='Descrição pro agente entender (ex: "faturamento mensal estimado em reais")'
            value={f.description || ''}
            onChange={(e) => update(i, { description: e.target.value })}
            className="h-7 text-[11px]"
          />
          {f.type === 'lista_opcoes' && (
            <Input
              placeholder="Opções (separadas por vírgula). Ex: decisor, influenciador, usuário"
              value={(f.options || []).join(', ')}
              onChange={(e) => update(i, {
                options: e.target.value ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : undefined,
              })}
              className="h-7 text-[11px]"
            />
          )}
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} className="w-full gap-1">
        <Plus className="h-3.5 w-3.5" />
        Adicionar pergunta
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Helpers (parse / build)
// ─────────────────────────────────────────────────────────
function parseSchemaToFields(schema: any): Field[] {
  if (!schema || schema.type !== 'object' || !schema.properties) return [];
  const required: string[] = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(schema.properties).map(([name, def]: [string, any]) => {
    const t = def.type;
    let type: FieldType = 'texto';
    if (t === 'number' || t === 'integer') type = 'numero';
    else if (t === 'boolean') type = 'verdadeiro_falso';
    else if (Array.isArray(def.enum)) type = 'lista_opcoes';
    return {
      name,
      type,
      description: def.description || '',
      required: required.includes(name),
      options: Array.isArray(def.enum) ? def.enum : undefined,
    };
  });
}

function buildSchemaFromFields(fields: Field[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    if (!f.name.trim()) continue;
    const ft = FIELD_TYPES.find((t) => t.id === f.type);
    const def: Record<string, unknown> = { type: ft?.jsonType || 'string' };
    if (f.description) def.description = f.description;
    if (f.type === 'lista_opcoes' && f.options) def.enum = f.options;
    properties[f.name] = def;
    if (f.required) required.push(f.name);
  }
  const result: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) result.required = required;
  return result;
}

function parseHelpersFromParamsMap(pm: Record<string, string>): string[] {
  const result: string[] = [];
  for (const [, value] of Object.entries(pm)) {
    const m = /^\{\{\s*([^}]+)\s*\}\}$/.exec(value.trim());
    if (m && SYSTEM_HELPERS.some((h) => h.key === m[1])) result.push(m[1]);
  }
  return result;
}

function getDefaultConfig(type: AgentTool['action_type']): Record<string, unknown> {
  switch (type) {
    case 'sql':
      return { function: '', params_map: {} };
    case 'http':
      return {
        url: 'https://api.exemplo.com/recurso',
        method: 'POST',
        headers: { Authorization: 'Bearer {{secret:MINHA_API_KEY}}' },
        body_template: '{ "campo": "{{valor}}" }',
        timeout_ms: 30000,
      };
    case 'webhook':
      return { url: 'https://hooks.zapier.com/...', fire_and_forget: true };
    case 'edge_function':
      return { name: 'minha-edge-function', timeout_ms: 60000 };
  }
}

// ─────────────────────────────────────────────────────────
// FunctionDescription — mostra em linguagem natural o que a SQL function faz
// ─────────────────────────────────────────────────────────
function FunctionDescription({ fnName }: { fnName: string }) {
  const trimmed = fnName.trim();
  const { data, isLoading } = useQuery({
    queryKey: ['agent-fn-describe', trimmed],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('agent_describe_function', { p_fn_name: trimmed });
      if (error) throw error;
      return data as { found: boolean; description?: string; arguments?: string; returns?: string };
    },
    enabled: trimmed.length > 2,
    staleTime: 5 * 60_000,
  });

  if (!trimmed || trimmed.length <= 2) return null;
  if (isLoading) return (
    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> verificando...
    </div>
  );

  if (!data?.found) {
    return (
      <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-[11px] text-amber-700 dark:text-amber-400">
          <strong>Função não existe no banco</strong> — confirma o nome ou peça pro time técnico criar.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-medium mb-1">
            O que essa ação faz
          </p>
          {data.description ? (
            <p className="text-xs text-foreground leading-snug">{data.description}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Função existe mas não tem descrição. Adicione um COMMENT pra ficar claro.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function getConfigHint(type: AgentTool['action_type']): string {
  switch (type) {
    case 'sql': return 'function = Postgres RPC. params_map: { param_sql: "{{var}}" }';
    case 'http': return 'Suporta {{var}} em strings. {{secret:NOME}} pra env var.';
    case 'webhook': return 'fire_and_forget=true não espera resposta.';
    case 'edge_function': return 'Body: { arguments, user_id, session_id }';
  }
}
