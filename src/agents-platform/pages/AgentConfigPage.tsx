/**
 * AgentConfigPage — UI completa de configuração.
 * Rota: /agentes/:slug/config
 *
 * Tabs: Geral · Prompt · Modelo · Tools · Canais
 * Features: versionamento, rollback, skill catalog, edição de tools, deployments
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ChevronLeft, MessageSquare, FlaskConical, TrendingUp,
  Plus, Pencil, Sparkles, History,
} from 'lucide-react';
import { useAgentConfig, type AgentConfig } from '../hooks/useAgentConfig';
import { useAgentTools, type AgentTool } from '../hooks/useAgentTools';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAgentsList } from '../hooks/useAgentConfig';
import { useCredentials, PROVIDER_LABELS } from '../hooks/useCredentials';
import { AgentAvatar, AVATAR_COLORS } from '../components/AgentAvatar';
import { ToolEditDrawer } from '../components/ToolEditDrawer';
import { SkillCatalogModal } from '../components/SkillCatalogModal';
import { VersionHistoryDrawer } from '../components/VersionHistoryDrawer';
import { TabCanais } from '../components/TabCanais';
import { TabRegras } from '../components/TabRegras';
import { TabHumanizacao } from '../components/TabHumanizacao';
import { TabNotas } from '../components/TabNotas';
import { cn } from '@/lib/utils';

export default function AgentConfigPage() {
  const { slug } = useParams<{ slug: string }>();
  const { config, loading, saveDraft, isSaving, publish, isPublishing } = useAgentConfig(slug!);

  const [draft, setDraft] = useState<Partial<AgentConfig>>({});
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  if (loading || !config) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const onSave = () => {
    const { id, slug: _s, created_at, updated_at, ...patch } = draft as AgentConfig;
    saveDraft(patch);
  };

  const onPublish = () => {
    // Summary automático com timestamp BR — sem prompt nativo chato.
    // Pra adicionar nota manual depois, dá pra editar a versão direto na aba "Histórico".
    const summary = `Publicado em ${new Date().toLocaleString('pt-BR')}`;
    publish({ draft, summary } as any);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/agentes" className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <AgentAvatar name={config.display_name} color={config.avatar_color} emoji={config.emoji} size="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold tracking-tight truncate">{config.display_name}</h1>
                <Badge variant="outline" className={cn(
                  'gap-1',
                  config.is_active ? 'border-emerald-500/30 text-emerald-600' : 'text-muted-foreground',
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', config.is_active ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                  {config.is_active ? 'Ativo' : 'Pausado'}
                </Badge>
                {/* Version + history */}
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  title="Histórico de versões"
                >
                  v{config.version}
                  <History className="h-3 w-3 opacity-60" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{config.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/agentes/${slug}/sessoes`}>
                <TrendingUp className="h-4 w-4 mr-1.5" />
                Sessões
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/agentes/${slug}/metricas`}>
                <TrendingUp className="h-4 w-4 mr-1.5" />
                Métricas
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/agentes/${slug}/playground`}>
                <FlaskConical className="h-4 w-4 mr-1.5" />
                Playground
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/agentes/${slug}`}>
                <MessageSquare className="h-4 w-4 mr-1.5" />
                Conversar
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar rascunho'}
            </Button>
            <Button
              size="sm" onClick={onPublish} disabled={isPublishing}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publicar versão'}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="geral" className="w-full">
          <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-2">
            {['Geral', 'Prompt', 'Modelo', 'Tools', 'Canais', 'Regras', 'Humanização', 'Notas'].map((label) => {
              const value = label.toLowerCase();
              return (
                <TabsTrigger
                  key={value} value={value}
                  className="data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="geral" className="pt-6">
            <TabGeral draft={draft} setDraft={setDraft} agentId={config.id} />
          </TabsContent>
          <TabsContent value="prompt" className="pt-6">
            <TabPrompt draft={draft} setDraft={setDraft} />
          </TabsContent>
          <TabsContent value="modelo" className="pt-6">
            <TabModelo draft={draft} setDraft={setDraft} />
          </TabsContent>
          <TabsContent value="tools" className="pt-6">
            <TabTools agentId={config.id} />
          </TabsContent>
          <TabsContent value="canais" className="pt-6">
            <TabCanais agentId={config.id} />
          </TabsContent>
          <TabsContent value="regras" className="pt-6">
            <TabRegras draft={draft} setDraft={setDraft} />
          </TabsContent>
          <TabsContent value="humanização" className="pt-6">
            <TabHumanizacao draft={draft} setDraft={setDraft} />
          </TabsContent>
          <TabsContent value="notas" className="pt-6">
            <TabNotas agentId={config.id} />
          </TabsContent>
        </Tabs>

        {historyOpen && (
          <VersionHistoryDrawer agentId={config.id} onClose={() => setHistoryOpen(false)} />
        )}
      </div>
    </AppLayout>
  );
}

// ─────────── Tab Geral expandida ───────────
function TabGeral({
  draft, setDraft, agentId,
}: {
  draft: Partial<AgentConfig>;
  setDraft: (d: any) => void;
  agentId: string;
}) {
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: allAgents = [] } = useAgentsList();

  // Filtra o próprio agente pra não virar parent dele mesmo
  const possibleParents = allAgents.filter((a) => a.id !== agentId);

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Nome</Label>
            <Input
              value={draft.display_name || ''}
              onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Emoji</Label>
            <Input
              maxLength={4} value={draft.emoji || ''}
              placeholder="🤖"
              onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
              className="mt-1.5 w-24 text-center text-xl"
            />
          </div>
        </div>

        <div>
          <Label>Propósito / papel</Label>
          <Textarea
            rows={2} value={draft.description || ''}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Responsável (humano)</Label>
            <select
              value={draft.responsible_user_id || ''}
              onChange={(e) => setDraft({ ...draft, responsible_user_id: e.target.value || null })}
              className="mt-1.5 w-full border border-input bg-background rounded-md px-3 py-2 text-sm"
            >
              <option value="">— Sem responsável —</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Tier (hierarquia organograma)</Label>
            <select
              value={draft.tier || 'specialist'}
              onChange={(e) => setDraft({ ...draft, tier: e.target.value as any })}
              className="mt-1.5 w-full border border-input bg-background rounded-md px-3 py-2 text-sm"
            >
              <option value="ceo">CEO (topo)</option>
              <option value="manager">Manager (orquestrador)</option>
              <option value="specialist">Specialist (folha)</option>
            </select>
          </div>
        </div>

        <div>
          <Label>Reportar a (parent no organograma)</Label>
          <select
            value={draft.parent_agent_id || ''}
            onChange={(e) => setDraft({ ...draft, parent_agent_id: e.target.value || null })}
            className="mt-1.5 w-full border border-input bg-background rounded-md px-3 py-2 text-sm"
          >
            <option value="">— Sem parent (vai conectar ao CEO) —</option>
            {possibleParents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.display_name} ({a.tier})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={draft.is_active ?? true}
            onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          <Label htmlFor="active" className="cursor-pointer">Agente ativo</Label>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <Label>Avatar</Label>
          <div className="mt-2 flex flex-col items-center gap-4 p-6 border border-border rounded-xl bg-card">
            <AgentAvatar
              name={draft.display_name || ''}
              color={draft.avatar_color}
              emoji={draft.emoji}
              size="xl"
            />
            <div>
              <p className="text-xs text-muted-foreground text-center mb-2">Cor</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraft({ ...draft, avatar_color: c })}
                    className={cn(
                      'h-7 w-7 rounded-full shadow border-2 bg-gradient-to-br transition-all',
                      `from-${c}-400 to-${c}-600`,
                      draft.avatar_color === c ? 'border-foreground scale-110' : 'border-transparent',
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────── Tab Prompt ───────────
function TabPrompt({ draft, setDraft }: { draft: Partial<AgentConfig>; setDraft: (d: any) => void }) {
  // Detecta {{variaveis}} no prompt (exceto as de sistema que o runtime resolve sozinho)
  const SYSTEM_VARS = new Set(['user_id', 'lead_id', 'deal_id', 'agent_id', 'session_id', 'channel', 'instance_id', 'activity_id']);
  const prompt = draft.system_prompt || '';
  const detectedVars = Array.from(
    new Set([...prompt.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1])),
  ).filter((v) => !SYSTEM_VARS.has(v));

  const templateVars = ((draft as any).template_variables as Array<{ name: string; label?: string; default?: string }>) || [];
  const templateValues = ((draft.settings as any)?.template_values as Record<string, string>) || {};

  const setValue = (name: string, value: string) => {
    setDraft({
      ...draft,
      settings: {
        ...(draft.settings || {}),
        template_values: { ...templateValues, [name]: value },
      },
    });
  };

  const labelFor = (name: string) =>
    templateVars.find((tv) => tv.name === name)?.label || name.replace(/_/g, ' ');

  // Heurística: valor curto → input 1 linha; longo → textarea
  const isLongField = (name: string, val: string) =>
    val.length > 60 || /prompt|grid|tom|tone|descri|regra|banned|bio|sobre|missao/i.test(name);

  const humanLabel = (name: string) => {
    const l = labelFor(name);
    return l.charAt(0).toUpperCase() + l.slice(1);
  };

  return (
    <div className="space-y-6">
      {/* Variáveis detectadas — preenche sem mexer no prompt */}
      {detectedVars.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold">Personalização</h3>
            <span className="text-[11px] text-muted-foreground">
              {detectedVars.length} {detectedVars.length === 1 ? 'campo' : 'campos'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-4 ml-9">
            Preenche os campos sem mexer no prompt. Útil pra reusar o agente como template.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            {detectedVars.map((name) => {
              const val = templateValues[name] ?? templateVars.find((tv) => tv.name === name)?.default ?? '';
              const long = isLongField(name, val);
              return (
                <div
                  key={name}
                  className={cn(
                    'rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/30',
                    long && 'sm:col-span-2',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span className="text-sm font-medium">{humanLabel(name)}</span>
                    <code className="text-[10px] text-muted-foreground/60 font-mono shrink-0">{`{{${name}}}`}</code>
                  </div>
                  {long ? (
                    <Textarea
                      rows={3}
                      value={val}
                      onChange={(e) => setValue(name, e.target.value)}
                      placeholder={`Defina ${humanLabel(name).toLowerCase()}...`}
                      className="text-[13px] resize-none border-muted bg-background/50 focus-visible:border-primary/40"
                    />
                  ) : (
                    <Input
                      value={val}
                      onChange={(e) => setValue(name, e.target.value)}
                      placeholder={`Defina ${humanLabel(name).toLowerCase()}...`}
                      className="text-[13px] h-9 border-muted bg-background/50 focus-visible:border-primary/40"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Prompt completo */}
      <div className="border-t border-border pt-5">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-semibold">Prompt completo</Label>
          <span className="text-[11px] text-muted-foreground">
            ~{Math.ceil(prompt.length / 4)} tokens
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Instruções do agente. Use <code className="bg-muted px-1 rounded text-[11px]">{`{{variavel}}`}</code> pra criar campos preenchíveis acima.
        </p>
        <Textarea
          rows={18}
          value={prompt}
          onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
          className="font-mono text-[13px] leading-relaxed"
        />
      </div>
    </div>
  );
}

// ─────────── Tab Modelo ───────────
function TabModelo({ draft, setDraft }: { draft: Partial<AgentConfig>; setDraft: (d: any) => void }) {
  const settings = draft.settings || {};
  const setSetting = (k: string, v: any) => setDraft({ ...draft, settings: { ...settings, [k]: v } });
  const { credentials } = useCredentials();

  // Modelos sugeridos por provider/credential
  const modelSuggestions: Record<string, string[]> = {
    openai_codex: ['gpt-5.5', 'gpt-5.4-mini'],
    anthropic_api: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
    openai_api: ['gpt-5.5', 'gpt-5.4', 'gpt-4.1-nano'],
    google_gemini: ['gemini-2.0-flash-exp', 'gemini-1.5-pro'],
    groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],
    fireworks: ['accounts/fireworks/models/deepseek-v3'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  };
  // SÓ credenciais de MODELO (LLM) — tools (meta_ads, uazapi, etc) não rodam o agente.
  const llmCredentials = credentials.filter((c) => PROVIDER_LABELS[c.provider_type]?.category === 'llm');
  const selectedCred = credentials.find((c) => c.id === draft.credential_id);
  const sugModels = selectedCred ? modelSuggestions[selectedCred.provider_type] || [] : [];

  return (
    <div className="grid md:grid-cols-2 gap-6 max-w-3xl">
      <div className="md:col-span-2">
        <Label>Credencial</Label>
        <div className="flex gap-2 mt-1.5">
          <select
            value={draft.credential_id || ''}
            onChange={(e) => setDraft({ ...draft, credential_id: e.target.value || null })}
            className="flex-1 border border-input bg-background rounded-md px-3 py-2 text-sm"
          >
            <option value="">— Sem credencial (usa env vars legacy) —</option>
            {llmCredentials.map((c) => {
              const info = PROVIDER_LABELS[c.provider_type];
              return (
                <option key={c.id} value={c.id}>
                  {info?.emoji} {c.label}
                </option>
              );
            })}
          </select>
          <Button asChild variant="outline" size="sm">
            <Link to="/agentes/credenciais">Gerenciar</Link>
          </Button>
        </div>
        {selectedCred && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {PROVIDER_LABELS[selectedCred.provider_type]?.description}
          </p>
        )}
      </div>

      {/* MODELO — a única escolha. Provider vem da credencial. */}
      <div className="md:col-span-2">
        <Label>Modelo</Label>
        {sugModels.length > 0 ? (
          <>
            <select
              value={sugModels.includes(draft.model || '') ? (draft.model || '') : '__custom__'}
              onChange={(e) => {
                if (e.target.value !== '__custom__') {
                  setDraft({ ...draft, model: e.target.value });
                }
              }}
              className="mt-1.5 w-full border border-input bg-background rounded-md px-3 py-2 text-sm"
            >
              {sugModels.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="__custom__">⚙️ Custom (digitar abaixo)</option>
            </select>
            {!sugModels.includes(draft.model || '') && (
              <Input
                value={draft.model || ''}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                className="mt-2" placeholder="Nome do modelo custom..."
              />
            )}
          </>
        ) : !selectedCred ? (
          <div className="mt-1.5 p-3 border border-amber-500/30 bg-amber-500/5 rounded text-xs text-amber-700">
            ⚠️ Selecione uma <strong>credencial</strong> acima primeiro pra ver os modelos disponíveis.
          </div>
        ) : (
          <Input
            value={draft.model || ''}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            className="mt-1.5" placeholder="Nome do modelo"
          />
        )}
      </div>
      <div>
        <Label>Temperatura ({settings.temperature ?? 0.7})</Label>
        <input
          type="range" min={0} max={1} step={0.1}
          value={settings.temperature ?? 0.7}
          onChange={(e) => setSetting('temperature', Number(e.target.value))}
          className="mt-2 w-full accent-primary"
        />
      </div>
      <div>
        <Label>Max tokens (resposta)</Label>
        <Input
          type="number" value={settings.max_tokens ?? 4000}
          onChange={(e) => setSetting('max_tokens', Number(e.target.value))}
          className="mt-1.5"
        />
      </div>
      <div>
        <Label>Sliding window (msgs no contexto)</Label>
        <Input
          type="number" value={settings.sliding_window ?? 20}
          onChange={(e) => setSetting('sliding_window', Number(e.target.value))}
          className="mt-1.5"
        />
      </div>
      <div>
        <Label>Máx. iterações de ferramentas ({settings.max_tool_iterations ?? 20})</Label>
        <Input
          type="number" min={1} max={40} value={settings.max_tool_iterations ?? 20}
          onChange={(e) => setSetting('max_tool_iterations', Number(e.target.value))}
          className="mt-1.5"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Quantas chamadas de ferramenta o agente pode encadear numa resposta. Suba pra agentes que exploram muito (gestor de tráfego). Padrão 20, máx 40.
        </p>
      </div>
      <div>
        <Label>Intervalo mínimo de rotina recorrente ({settings.min_recurrence_minutes ?? 5} min)</Label>
        <Input
          type="number" min={1} max={1440} value={settings.min_recurrence_minutes ?? 5}
          onChange={(e) => setSetting('min_recurrence_minutes', Number(e.target.value))}
          className="mt-1.5"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Piso pra lembretes recorrentes deste agente (evita flood e gasto de tokens). Cada disparo roda o agente. Padrão 5 min. Pra monitor rápido baixe; pra cobrança diária deixe alto.
        </p>
      </div>
      <div>
        <Label>Limite custo diário (R$)</Label>
        <Input
          type="number" step="0.01"
          value={draft.daily_cost_limit_brl ?? ''}
          placeholder="50.00"
          onChange={(e) => setDraft({ ...draft, daily_cost_limit_brl: e.target.value ? Number(e.target.value) : null })}
          className="mt-1.5"
        />
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-border p-3">
        <input
          type="checkbox" id="show_tool_details"
          checked={!!settings.show_tool_details}
          onChange={(e) => setSetting('show_tool_details', e.target.checked)}
          className="h-4 w-4 accent-primary mt-0.5"
        />
        <Label htmlFor="show_tool_details" className="cursor-pointer">
          Mostrar detalhes técnicos das ferramentas
          <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
            Por padrão o chat mostra só "🔧 consultando Meta Ads…" (limpo). Ligue pra ver input/output completo de cada ferramenta (modo debug).
          </span>
        </Label>
      </div>

      {/* ─── Ferramentas nativas do provider (web search, etc) ─── */}
      <div className="md:col-span-2">
        <NativeToolsSection
          providerType={selectedCred?.provider_type}
          enabled={Array.isArray(settings.native_tools) ? settings.native_tools : []}
          onToggle={(key, on) => {
            const cur: string[] = Array.isArray(settings.native_tools) ? settings.native_tools : [];
            const next = on ? [...new Set([...cur, key])] : cur.filter((k) => k !== key);
            setSetting('native_tools', next);
          }}
        />
      </div>
    </div>
  );
}

// Ferramentas que rodam DENTRO do modelo (server-side do provider), sem credencial extra.
// Catálogo por provider — só mostra as que o provider da credencial suporta.
const NATIVE_TOOLS_BY_PROVIDER: Record<string, Array<{ key: string; label: string; desc: string; emoji: string }>> = {
  openai_codex: [
    { key: 'web_search', label: 'Buscar na web', desc: 'O agente pesquisa no Google/Bing em tempo real e lê o conteúdo.', emoji: '🌐' },
    // Nota: o backend do Codex (via sub ChatGPT) só expõe web_search. image_generation
    // e code_interpreter não são suportados nesse endpoint (dão 400). Use Anthropic/Gemini pra isso.
  ],
  anthropic_api: [
    { key: 'web_search', label: 'Buscar na web', desc: 'O agente pesquisa na web em tempo real (Claude nativo).', emoji: '🌐' },
    { key: 'web_fetch', label: 'Ler URL', desc: 'Abre um link específico e lê o conteúdo limpo.', emoji: '📄' },
    { key: 'code_interpreter', label: 'Rodar código', desc: 'Executa código pra cálculos e análise.', emoji: '🐍' },
  ],
  google_gemini: [
    { key: 'web_search', label: 'Buscar na web', desc: 'Google Search nativo (grounding).', emoji: '🌐' },
    { key: 'web_fetch', label: 'Ler URL', desc: 'Lê o conteúdo de um link (URL context).', emoji: '📄' },
    { key: 'code_interpreter', label: 'Rodar código', desc: 'Executa Python nativo do Gemini.', emoji: '🐍' },
  ],
};

function NativeToolsSection({
  providerType, enabled, onToggle,
}: {
  providerType?: string;
  enabled: string[];
  onToggle: (key: string, on: boolean) => void;
}) {
  const available = providerType ? NATIVE_TOOLS_BY_PROVIDER[providerType] : undefined;

  return (
    <div className="border border-border rounded-lg p-4 bg-muted/20">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">Acesso à web e ferramentas do modelo</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">grátis · sem API key</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Recursos nativos do modelo — não precisa de credencial extra nem configurar tool.
      </p>

      {!providerType ? (
        <p className="text-xs text-amber-600">Selecione uma credencial acima primeiro.</p>
      ) : !available ? (
        <p className="text-xs text-muted-foreground">
          O provider desta credencial não expõe ferramentas nativas. Use tools do catálogo (ex: Jina, Tavily) pra dar acesso à web.
        </p>
      ) : (
        <div className="space-y-2">
          {available.map((t) => {
            const on = enabled.includes(t.key);
            return (
              <label
                key={t.key}
                className="flex items-start gap-3 p-2.5 rounded-md hover:bg-background/60 cursor-pointer border border-transparent hover:border-border transition-colors"
              >
                <input
                  type="checkbox" checked={on}
                  onChange={(e) => onToggle(t.key, e.target.checked)}
                  className="mt-0.5 accent-primary h-4 w-4"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm flex items-center gap-1.5">
                    <span>{t.emoji}</span><span>{t.label}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{t.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────── Tab Tools ───────────
function TabTools({ agentId }: { agentId: string }) {
  const { tools, loading, setMode } = useAgentTools(agentId);
  const [editingTool, setEditingTool] = useState<AgentTool | null | undefined>(undefined);
  const [catalogOpen, setCatalogOpen] = useState(false);

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  const modeLabels = {
    always: { label: 'Sempre', class: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
    with_approval: { label: 'Com aprovação', class: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' },
    disabled: { label: 'Desativada', class: 'bg-muted text-muted-foreground border-border' },
  } as const;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {tools.length === 0 ? 'Nenhuma tool ainda' : `${tools.length} ${tools.length === 1 ? 'tool' : 'tools'}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="outline"
            onClick={() => setCatalogOpen(true)}
            className="border-primary/30 hover:bg-primary/5"
          >
            <Sparkles className="h-4 w-4 mr-1.5 text-primary" />
            Adicionar do catálogo
          </Button>
          <Button
            size="sm" onClick={() => setEditingTool(null)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Custom
          </Button>
        </div>
      </div>

      {tools.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Adiciona tools do catálogo OU cria custom.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tools.map((t) => (
            <div key={t.id} className="group flex items-start justify-between gap-4 p-4 border border-border rounded-xl bg-card hover:border-primary/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-foreground font-mono">{t.name}</h3>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {t.action_type}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1">
                  {(['always', 'with_approval', 'disabled'] as const).map((m) => {
                    const cfg = modeLabels[m];
                    const active = t.usage_mode === m;
                    return (
                      <button
                        key={m}
                        onClick={() => setMode({ toolId: t.id, mode: m })}
                        className={cn(
                          'text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all',
                          active ? cfg.class : 'border-border text-muted-foreground/70 hover:text-foreground',
                        )}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setEditingTool(t)} title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingTool !== undefined && (
        <ToolEditDrawer agentId={agentId} tool={editingTool} onClose={() => setEditingTool(undefined)} />
      )}
      {catalogOpen && (
        <SkillCatalogModal agentId={agentId} onClose={() => setCatalogOpen(false)} />
      )}
    </>
  );
}
