/**
 * TabCanais — gerencia deployments do agente (onde ele aparece).
 */

import { useEffect, useState } from 'react';
import { Plus, Trash2, MessageSquare, MessageCircle, Layers, Sidebar, Send, Instagram, Mail, Clock, Loader2, ExternalLink, Copy, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAgentDeployments, type Channel, type AgentDeployment } from '../hooks/useAgentDeployments';
import { MatchRulesEditor } from './MatchRulesEditor';
import { WhatsAppDeploymentForm } from './WhatsAppDeploymentForm';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const SUPABASE_PROJECT_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vqbobkzwhloxnndujgew.supabase.co';

// Só canais com backend funcional. (Instagram/Email/Sidebar/Inbox/Cron viriam em ondas futuras.)
const CHANNELS: Array<{ id: Channel; label: string; icon: any; description: string }> = [
  { id: 'chat_web', label: 'Chat web', icon: MessageSquare, description: 'Conversa interna na rota /agentes/:slug — você e sua equipe' },
  { id: 'whatsapp', label: 'WhatsApp', icon: Send, description: 'Atende leads de uma instância WhatsApp conectada' },
  { id: 'telegram', label: 'Telegram', icon: Send, description: 'Atende via bot do Telegram' },
  { id: 'floating', label: 'Botão flutuante', icon: MessageCircle, description: 'Bolha de acesso rápido em qualquer página do CRM' },
];

export function TabCanais({ agentId }: { agentId: string }) {
  const { deployments, loading, upsert, remove } = useAgentDeployments(agentId);
  const [adding, setAdding] = useState<Channel | null>(null);

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  const existing = new Map(deployments.map((d) => [d.channel, d]));
  const available = CHANNELS.filter((c) => !existing.has(c.id));

  return (
    <div className="space-y-6">
      {/* Ativos */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Canais Ativos ({deployments.length})
        </h3>
        {deployments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nenhum canal configurado. Adicione abaixo.</p>
        ) : (
          <div className="space-y-2">
            {deployments.map((d) => {
              const ch = CHANNELS.find((c) => c.id === d.channel);
              const Icon = ch?.icon || MessageSquare;
              return (
                <DeploymentCard
                  key={d.id}
                  deployment={d}
                  channelLabel={ch?.label || d.channel}
                  Icon={Icon}
                  onSave={(config) => upsert({ ...d, config })}
                  onToggle={(active) => upsert({ ...d, is_active: active })}
                  onRemove={() => {
                    if (confirm(`Remover canal ${ch?.label || d.channel}?`)) remove(d.id);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Disponíveis pra adicionar */}
      {available.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Adicionar Canal
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {available.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    upsert({ agent_id: agentId, channel: c.id, config: defaultConfig(c.id) });
                  }}
                  className="text-left p-3 border border-dashed border-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{c.label}</span>
                    <Plus className="h-3 w-3 text-primary ml-auto" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{c.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function defaultConfig(channel: Channel): Record<string, any> {
  switch (channel) {
    case 'floating':
      return { route: '/comercial/pipeline', position: 'bottom-right', button_text: '' };
    case 'sidebar':
      return { route: '/clientes/:id', width: 380 };
    case 'whatsapp':
      return { instance_id: '' };
    case 'telegram':
      return { bot_token: '', bot_username: '', webhook_secret: '' };
    case 'instagram':
      return { account_id: '' };
    case 'email':
      return { mailbox: '' };
    case 'cron':
      return { schedule: '0 9 * * 1-5', prompt_kickoff: 'Manda relatório semanal' };
    default:
      return {};
  }
}

function DeploymentCard({
  deployment, channelLabel, Icon, onSave, onToggle, onRemove,
}: {
  deployment: AgentDeployment;
  channelLabel: string;
  Icon: any;
  onSave: (config: Record<string, any>) => void;
  onToggle: (active: boolean) => void;
  onRemove: () => void;
}) {
  const [config, setConfig] = useState(deployment.config);
  const [dirty, setDirty] = useState(false);

  // FIX: sincroniza local state quando deployment (do banco) muda — depois de salvar,
  // React Query refetch e config local fica desatualizado sem isso.
  useEffect(() => {
    setConfig(deployment.config);
  }, [deployment.id, deployment.updated_at]);

  const setField = (k: string, v: any) => {
    setConfig({ ...config, [k]: v });
    setDirty(true);
  };

  const save = () => {
    onSave(config);
    setDirty(false);
  };

  // Persiste IMEDIATAMENTE um config já modificado (ex: aprovar usuário → salva na hora,
  // sem depender do botão "Salvar"). Atualiza o estado local junto.
  const saveNow = (cfg: Record<string, any>) => {
    setConfig(cfg);
    onSave(cfg);
    setDirty(false);
  };

  return (
    <div className={cn(
      'p-4 border rounded-xl bg-card',
      deployment.is_active ? 'border-border' : 'border-border opacity-60',
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">{channelLabel}</span>
          {deployment.is_active ? (
            <Badge variant="outline" className="h-5 text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
              <span className="h-1 w-1 rounded-full bg-emerald-500" /> Ativo
            </Badge>
          ) : (
            <Badge variant="outline" className="h-5 text-[10px]">Pausado</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onToggle(!deployment.is_active)}>
            {deployment.is_active ? 'Pausar' : 'Ativar'}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* WhatsApp tem form próprio (organizado por finalidade: interno vs leads). */}
      {/* Outros canais: form genérico + regras de roteamento como antes. */}
      {deployment.channel === 'whatsapp' ? (
        <WhatsAppDeploymentForm config={config} setField={setField} />
      ) : (
        <>
          <ConfigFields
            channel={deployment.channel}
            deploymentId={deployment.id}
            config={config}
            setField={setField}
            onSaveNow={saveNow}
          />
          <MatchRulesEditor config={config} setField={setField} />
        </>
      )}

      {dirty && (
        <Button size="sm" className="mt-3 h-7 text-xs bg-primary hover:bg-primary text-white" onClick={save}>
          Salvar
        </Button>
      )}
    </div>
  );
}

function ConfigFields({
  channel, deploymentId, config, setField, onSaveNow,
}: {
  channel: Channel;
  deploymentId: string;
  config: Record<string, any>;
  setField: (k: string, v: any) => void;
  onSaveNow: (cfg: Record<string, any>) => void;
}) {
  switch (channel) {
    case 'floating':
      return (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rota</Label>
            <Input
              value={config.route || ''}
              onChange={(e) => setField('route', e.target.value)}
              placeholder="/comercial/pipeline"
              className="mt-1 h-8 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Posição</Label>
            <select
              value={config.position || 'bottom-right'}
              onChange={(e) => setField('position', e.target.value)}
              className="mt-1 w-full h-8 border border-input bg-background rounded-md px-2 text-xs"
            >
              <option value="bottom-right">Inferior direito</option>
              <option value="bottom-left">Inferior esquerdo</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Texto do botão (opcional)</Label>
            <Input
              value={config.button_text || ''}
              onChange={(e) => setField('button_text', e.target.value)}
              placeholder="🧠 Análise"
              className="mt-1 h-8 text-xs"
            />
          </div>
        </div>
      );
    case 'whatsapp':
      return (
        <div>
          <Label className="text-xs">Instance ID (whatsapp_instances)</Label>
          <Input
            value={config.instance_id || ''}
            onChange={(e) => setField('instance_id', e.target.value)}
            placeholder="69d283e2-..."
            className="mt-1 h-8 text-xs font-mono"
          />
        </div>
      );
    case 'sidebar':
      return (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rota</Label>
            <Input
              value={config.route || ''}
              onChange={(e) => setField('route', e.target.value)}
              className="mt-1 h-8 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Largura (px)</Label>
            <Input
              type="number"
              value={config.width || 380}
              onChange={(e) => setField('width', Number(e.target.value))}
              className="mt-1 h-8 text-xs"
            />
          </div>
        </div>
      );
    case 'cron':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Schedule (cron)</Label>
            <Input
              value={config.schedule || ''}
              onChange={(e) => setField('schedule', e.target.value)}
              placeholder="0 9 * * 1-5"
              className="mt-1 h-8 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Prompt de kickoff</Label>
            <Input
              value={config.prompt_kickoff || ''}
              onChange={(e) => setField('prompt_kickoff', e.target.value)}
              className="mt-1 h-8 text-xs"
            />
          </div>
        </div>
      );
    case 'chat_web':
      return <p className="text-xs text-muted-foreground italic">Rota auto: /agentes/{`{slug}`}</p>;
    case 'telegram':
      return <TelegramConfigFields deploymentId={deploymentId} config={config} setField={setField} onSaveNow={onSaveNow} />;
    default:
      return (
        <div className="space-y-2">
          {Object.entries(config).filter(([k]) => !k.startsWith('__')).map(([k, v]) => (
            <div key={k}>
              <Label className="text-xs">{k}</Label>
              <Input
                value={String(v ?? '')}
                onChange={(e) => setField(k, e.target.value)}
                className="mt-1 h-8 text-xs font-mono"
              />
            </div>
          ))}
        </div>
      );
  }
}

// ─────────── Telegram: setup wizard com instruções ───────────
function TelegramConfigFields({
  deploymentId, config, setField, onSaveNow,
}: {
  deploymentId: string;
  config: Record<string, any>;
  setField: (k: string, v: any) => void;
  onSaveNow: (cfg: Record<string, any>) => void;
}) {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'unknown' | 'ok' | 'error'>(
    config.webhook_connected_at ? 'ok' : 'unknown'
  );
  const [statusMsg, setStatusMsg] = useState('');

  // Auto-cria webhook_secret se faltar (deployment legacy ou novo) — useEffect pra evitar re-render loop
  useEffect(() => {
    if (!config.webhook_secret) setField('webhook_secret', generateSecret());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const webhookUrl = `${SUPABASE_PROJECT_URL}/functions/v1/telegram-webhook/${deploymentId}`;

  const copy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
    toast({ title: 'Copiado!' });
  };

  const configureWebhook = async () => {
    if (!config.bot_token) {
      toast({ title: 'Cola o token primeiro', variant: 'destructive' });
      return;
    }
    setTesting(true);
    setStatusMsg('');
    try {
      // 1. Configura webhook no Telegram
      const res = await fetch(`https://api.telegram.org/bot${config.bot_token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: config.webhook_secret,
          drop_pending_updates: true,
          allowed_updates: ['message'],
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus('error');
        setStatusMsg(data.description || 'Erro desconhecido');
        toast({ title: 'Falhou no Telegram', description: data.description, variant: 'destructive' });
        return;
      }

      // 2. Pega username do bot
      let username: string | undefined;
      try {
        const me = await fetch(`https://api.telegram.org/bot${config.bot_token}/getMe`).then((r) => r.json());
        if (me.ok && me.result?.username) {
          username = me.result.username;
          setField('bot_username', username);
        }
      } catch { /* ignore */ }

      setField('webhook_connected_at', new Date().toISOString());
      setStatus('ok');
      setStatusMsg(username
        ? `Conectado! Vai no Telegram, abre @${username} e manda /start pra testar.`
        : 'Webhook configurado! Manda mensagem pro bot pra testar.');
      toast({ title: 'Bot conectado!' });
    } catch (e: any) {
      setStatus('error');
      setStatusMsg(e.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs space-y-2">
        <p className="font-semibold text-foreground">📘 Como configurar (3 minutos):</p>
        <ol className="list-decimal pl-4 space-y-1.5 text-muted-foreground">
          <li>Abre o Telegram e fala com <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-mono">@BotFather</a></li>
          <li>Manda <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">/newbot</code>, escolhe nome + username (tem que terminar com <code className="bg-muted px-1 rounded">bot</code>)</li>
          <li>BotFather devolve um <strong>token</strong> tipo <code className="bg-muted px-1 rounded text-[10px]">1234567:AAFxxx…</code></li>
          <li>Cola o token abaixo e clica <strong>"Conectar bot"</strong> — pronto!</li>
          <li>Vai pro Telegram e manda <code className="bg-muted px-1 rounded">/start</code> pro teu bot</li>
        </ol>
      </div>

      <div>
        <Label className="text-xs">Token do bot (do BotFather)</Label>
        <Input
          type="password"
          value={config.bot_token || ''}
          onChange={(e) => setField('bot_token', e.target.value.trim())}
          placeholder="1234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="mt-1 h-8 text-xs font-mono"
        />
        {config.bot_username && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Bot: <code className="text-emerald-600">@{config.bot_username}</code>
          </p>
        )}
      </div>

      <div>
        <Label className="text-xs">URL do webhook (auto)</Label>
        <div className="flex gap-1 mt-1">
          <Input value={webhookUrl} readOnly className="h-8 text-[11px] font-mono bg-muted/40" />
          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => copy(webhookUrl, 'url')}>
            {copiedField === 'url' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-xs">Secret do webhook (auto-gerado)</Label>
        <div className="flex gap-1 mt-1">
          <Input value={config.webhook_secret || ''} readOnly className="h-8 text-[11px] font-mono bg-muted/40" />
          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => setField('webhook_secret', generateSecret())} title="Regenerar">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
        <Button
          size="sm" onClick={configureWebhook}
          disabled={testing || !config.bot_token}
          className="bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ExternalLink className="h-4 w-4 mr-1.5" />}
          {status === 'ok' ? 'Reconectar bot' : 'Conectar bot'}
        </Button>
        {!config.bot_token && (
          <span className="text-[11px] text-amber-600">↑ Cola o token primeiro</span>
        )}
        {status === 'ok' && (
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 gap-1">
            <Check className="h-3 w-3" /> Conectado
          </Badge>
        )}
        {status === 'error' && (
          <Badge variant="outline" className="border-red-500/30 text-red-600">Erro</Badge>
        )}
      </div>
      {statusMsg && (
        <p className={cn('text-[11px]', status === 'ok' ? 'text-emerald-600' : 'text-red-600')}>{statusMsg}</p>
      )}

      {/* ─── ACCESS CONTROL ─── */}
      {config.webhook_connected_at && (
        <TelegramAccessControl config={config} setField={setField} onSaveNow={onSaveNow} />
      )}
    </div>
  );
}

// ─────────── Telegram Access Control ───────────
function TelegramAccessControl({
  config, setField, onSaveNow,
}: { config: Record<string, any>; setField: (k: string, v: any) => void; onSaveNow: (cfg: Record<string, any>) => void }) {
  const { toast } = useToast();
  const accessMode: 'open' | 'invite_only' | 'private' = config.access_mode || 'open';
  const tokens: any[] = config.invite_tokens || [];
  const authorized: any[] = config.authorized_users || [];
  const pending: any[] = config.pending_users || [];
  const blocked: string[] = config.blocked_users || [];
  const botUsername = config.bot_username;

  const [newLabel, setNewLabel] = useState('');
  const [newMaxUses, setNewMaxUses] = useState<number | ''>('');
  const [newExpiresDays, setNewExpiresDays] = useState<number | ''>('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const createToken = () => {
    if (!newLabel.trim()) {
      toast({ title: 'Dá um nome pro convite', variant: 'destructive' });
      return;
    }
    const tokenId = generateSecret().slice(0, 16);  // 16 chars, suficiente
    const newTok = {
      id: tokenId,
      label: newLabel.trim(),
      max_uses: newMaxUses ? Number(newMaxUses) : null,
      used_count: 0,
      expires_at: newExpiresDays
        ? new Date(Date.now() + Number(newExpiresDays) * 86400_000).toISOString()
        : null,
      created_at: new Date().toISOString(),
    };
    setField('invite_tokens', [...tokens, newTok]);
    setNewLabel('');
    setNewMaxUses('');
    setNewExpiresDays('');
    toast({ title: '🎟 Convite criado — clica Salvar' });
  };

  const revokeToken = (id: string) => {
    if (!confirm('Apagar esse link? Quem já entrou continua autorizado.')) return;
    setField('invite_tokens', tokens.filter((t) => t.id !== id));
  };

  // Ações de acesso PERSISTEM na hora (onSaveNow) — aprovar/bloquear não precisa de "Salvar".
  const revokeUser = (uid: string) => {
    if (!confirm('Revogar acesso desse usuário?')) return;
    onSaveNow({ ...config, authorized_users: authorized.filter((u) => u.telegram_user_id !== uid) });
  };

  const approveUser = (p: any) => {
    onSaveNow({
      ...config,
      authorized_users: [...authorized, {
        telegram_user_id: p.telegram_user_id,
        first_name: p.first_name || p.name,
        username: p.username,
        entered_via: 'manual_approval',
        authorized_at: new Date().toISOString(),
      }],
      pending_users: pending.filter((x) => x.telegram_user_id !== p.telegram_user_id),
    });
    toast({ title: `${p.first_name || p.name || 'Usuário'} liberado ✓` });
  };

  const blockUser = (uid: string) => {
    onSaveNow({
      ...config,
      blocked_users: [...new Set([...blocked, uid])],
      pending_users: pending.filter((p) => p.telegram_user_id !== uid),
      authorized_users: authorized.filter((u) => u.telegram_user_id !== uid),
    });
  };

  const unblockUser = (uid: string) => {
    onSaveNow({ ...config, blocked_users: blocked.filter((b) => b !== uid) });
  };

  const copyInviteLink = (tokenId: string) => {
    const url = `https://t.me/${botUsername}?start=${tokenId}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(tokenId);
    setTimeout(() => setCopiedToken(null), 1500);
    toast({ title: '🔗 Link copiado!' });
  };

  return (
    <div className="space-y-4 pt-4 mt-2 border-t-2 border-primary/20">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">🔒 Acesso</h4>
        <select
          value={accessMode}
          onChange={(e) => setField('access_mode', e.target.value)}
          className="h-8 border border-input bg-background rounded-md px-2 text-xs"
        >
          <option value="open">🌐 Aberto (perigoso)</option>
          <option value="invite_only">🔗 Só por convite (recomendado)</option>
          <option value="private">🔒 Privado (só lista)</option>
        </select>
      </div>

      {accessMode === 'open' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2.5 text-[11px] text-red-700 dark:text-red-400">
          ⚠️ <strong>Bot público</strong> — qualquer um do Telegram que achar o bot pode usar. Não recomendado.
        </div>
      )}

      {accessMode !== 'open' && (
        <>
          {/* Convites ativos */}
          {accessMode === 'invite_only' && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                🎟 Links de convite ({tokens.length})
              </p>
              <div className="space-y-1.5 mb-2">
                {tokens.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic px-1">Nenhum convite ainda. Cria abaixo.</p>
                ) : (
                  tokens.map((t) => {
                    const url = `https://t.me/${botUsername}?start=${t.id}`;
                    const expired = t.expires_at && new Date(t.expires_at) < new Date();
                    const exhausted = t.max_uses && (t.used_count || 0) >= t.max_uses;
                    return (
                      <div key={t.id} className={cn(
                        'p-2 border rounded-md bg-card text-xs',
                        (expired || exhausted) && 'opacity-50',
                      )}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-medium text-foreground">{t.label || t.id}</span>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyInviteLink(t.id)}>
                              {copiedToken === t.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-600" onClick={() => revokeToken(t.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                          <span>{t.used_count || 0}/{t.max_uses || '∞'} usos</span>
                          {t.expires_at && (
                            <span>· expira {new Date(t.expires_at).toLocaleDateString('pt-BR')}</span>
                          )}
                          {expired && <Badge variant="outline" className="h-4 text-[9px] border-red-500/30 text-red-600">expirou</Badge>}
                          {exhausted && <Badge variant="outline" className="h-4 text-[9px] border-red-500/30 text-red-600">esgotado</Badge>}
                        </div>
                        <div className="mt-1.5 font-mono text-[10px] text-blue-600 truncate">{url}</div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Criar novo */}
              <div className="grid grid-cols-12 gap-1.5 items-end p-2 border border-dashed border-border rounded-md">
                <div className="col-span-5">
                  <Label className="text-[10px]">Nome</Label>
                  <Input
                    value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Sócios, VIP, Cliente X..."
                    className="h-7 text-xs"
                  />
                </div>
                <div className="col-span-3">
                  <Label className="text-[10px]">Máx usos</Label>
                  <Input
                    type="number" min={1}
                    value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value ? Number(e.target.value) : '')}
                    placeholder="∞"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px]">Dias</Label>
                  <Input
                    type="number" min={1}
                    value={newExpiresDays} onChange={(e) => setNewExpiresDays(e.target.value ? Number(e.target.value) : '')}
                    placeholder="∞"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <Button size="sm" onClick={createToken} className="h-7 w-full text-xs bg-blue-500 hover:bg-blue-600 text-white">
                    <Plus className="h-3 w-3 mr-1" />
                    Criar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Usuários autorizados */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              👥 Autorizados ({authorized.length})
            </p>
            {authorized.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic px-1">Ninguém autorizado ainda.</p>
            ) : (
              <div className="space-y-1">
                {authorized.map((u) => {
                  const fromTok = tokens.find((t) => t.id === u.entered_via);
                  return (
                    <div key={u.telegram_user_id} className="flex items-center justify-between p-1.5 border border-border/50 rounded text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span className="font-medium">{u.first_name}</span>
                          {u.username && <span className="text-muted-foreground">@{u.username}</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground ml-3.5">
                          via {fromTok?.label || u.entered_via || 'manual'} ·
                          {' '}{new Date(u.authorized_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-600" onClick={() => revokeUser(u.telegram_user_id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pendentes */}
          {pending.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-amber-600 uppercase tracking-wider mb-2">
                ⏳ Pendentes ({pending.length}) — tentaram entrar sem convite
              </p>
              <div className="space-y-1">
                {pending.map((p) => (
                  <div key={p.telegram_user_id} className="flex items-center justify-between p-2 border border-amber-500/30 bg-amber-500/5 rounded text-xs">
                    <div className="min-w-0">
                      <span className="font-medium">{p.first_name || p.name || 'Usuário'}</span>
                      {p.username && <span className="text-muted-foreground ml-1">@{p.username}</span>}
                      <span className="text-[10px] text-muted-foreground ml-2">id {p.telegram_user_id}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => approveUser(p)}>
                        <Check className="h-3 w-3 mr-1" />
                        Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-600 hover:bg-red-500/5" onClick={() => blockUser(p.telegram_user_id)}>
                        Bloquear
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bloqueados */}
          {blocked.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-red-600 uppercase tracking-wider mb-2">
                ⛔ Bloqueados ({blocked.length})
              </p>
              <div className="space-y-1">
                {blocked.map((uid) => (
                  <div key={uid} className="flex items-center justify-between p-1.5 border border-red-500/30 bg-red-500/5 rounded text-xs">
                    <span className="font-mono">id {uid}</span>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => unblockUser(uid)}>
                      Desbloquear
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function generateSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
