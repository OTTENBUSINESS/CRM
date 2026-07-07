/**
 * NewCredentialDialog — wizard pra cadastrar credencial nova.
 * Suporta Codex OAuth (cola access_token + refresh_token + account_id) ou API key.
 */

import { useState } from 'react';
import { X, Loader2, Copy, Check, ExternalLink, Terminal, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCredentials, PROVIDER_LABELS, type ProviderType } from '../hooks/useCredentials';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export function NewCredentialDialog({ onClose }: { onClose: () => void }) {
  const { create: save, isCreating: isSaving } = useCredentials();
  const { toast } = useToast();

  const [providerType, setProviderType] = useState<ProviderType>('openai_codex');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [authJsonPaste, setAuthJsonPaste] = useState('');  // pro Codex OAuth
  const [isShared, setIsShared] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  /** Pros providers com múltiplos campos (Buffer, UAZAPI, custom) */
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});

  const [importing, setImporting] = useState(false);

  const onSave = async () => {
    // Nome é opcional — se vazio, usa o nome do provider (ex: "UAZAPI WhatsApp").
    const finalLabel = label.trim() || info?.name || providerType;

    // CODEX → usa edge function (valida + refresh automático)
    if (providerType === 'openai_codex') {
      if (!authJsonPaste.trim()) {
        toast({ title: 'Cola o conteúdo do auth.json', variant: 'destructive' });
        return;
      }
      setImporting(true);
      try {
        const { data, error } = await supabase.functions.invoke('agents-codex-import', {
          body: { auth_json: authJsonPaste, label: finalLabel, is_shared: isShared },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Falha ao importar');

        const exp = data.expires_at ? new Date(data.expires_at * 1000).toLocaleString('pt-BR') : '?';
        toast({
          title: data.refreshed ? 'Importado e renovado!' : 'Importado!',
          description: `Token expira em ${exp}. Refresh roda sozinho daqui pra frente.`,
        });
        onClose();
      } catch (e: any) {
        toast({
          title: 'Falha ao importar',
          description: e.message || 'Verifica se o JSON é o conteúdo COMPLETO do ~/.codex/auth.json',
          variant: 'destructive',
        });
      } finally {
        setImporting(false);
      }
      return;
    }

    // Provider com campos custom (token, ad_account_id, base_url, etc).
    // Monta authData FIEL aos nomes dos campos do schema — cada campo com sua chave.
    // Isso evita salvar 'token' como 'api_key' (bug que quebrava Meta Ads).
    const fields = info?.fields || [{ name: 'api_key', label: 'API key', required: true } as any];

    // 1º campo de credencial (api_key OU token) usa o input principal (apiKey).
    // Demais campos vêm de extraFields.
    const primaryField = fields.find((f) => f.name === 'api_key' || f.name === 'token') || fields[0];
    const authData: Record<string, string> = {};
    for (const f of fields) {
      const val = f.name === primaryField.name ? apiKey.trim() : (extraFields[f.name] || '').trim();
      if (f.required && !val) {
        toast({ title: `Preenche o campo "${f.label}"`, variant: 'destructive' });
        return;
      }
      if (val) authData[f.name] = val;
    }

    save(
      { provider_type: providerType, label: finalLabel, auth_data: authData, metadata: {}, is_shared: isShared } as any,
      { onSuccess: () => onClose() },
    );
  };

  const copyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1500);
  };

  const info = PROVIDER_LABELS[providerType];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-4 top-[5vh] bottom-[5vh] max-w-2xl mx-auto bg-background border border-border rounded-2xl z-50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Nova credencial</h2>
            <p className="text-sm text-muted-foreground mt-1">Conecta um provider de IA</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Provider type selector */}
          <div>
            <Label>Provider</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(Object.entries(PROVIDER_LABELS) as [ProviderType, typeof PROVIDER_LABELS[ProviderType]][]).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => setProviderType(key)}
                  className={cn(
                    'text-left p-3 border rounded-lg transition-all',
                    providerType === key
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{p.emoji}</span>
                    <span className="text-sm font-medium">{p.name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Label */}
          <div>
            <Label>Nome <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={info?.name || 'Ex: Anthropic Prod'}
              className="mt-1.5"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Se deixar vazio, usa "{info?.name}".
            </p>
          </div>

          {/* CODEX OAuth specific */}
          {providerType === 'openai_codex' && (
            <>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs flex items-start gap-2">
                <Zap className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Refresh automático ativo</p>
                  <p className="text-muted-foreground mt-0.5">
                    Plug uma vez — o agente renova o token sozinho via OAuth quando expira.
                    Você só precisa do <code className="text-[10px] bg-muted px-1 rounded">auth.json</code> inicial.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-xs space-y-3">
                <p className="font-semibold text-foreground flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Como conectar (3 passos)
                </p>

                <div>
                  <p className="font-medium mb-1">1. Instale o Codex CLI (uma vez só):</p>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 bg-muted px-2 py-1.5 rounded font-mono text-[11px]">
                      npm install -g @openai/codex
                    </code>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => copyCmd('npm install -g @openai/codex')}>
                      {copiedCmd ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="font-medium mb-1">2. Faça login com sua conta ChatGPT (precisa Plus ou Pro):</p>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 bg-muted px-2 py-1.5 rounded font-mono text-[11px]">
                      codex login
                    </code>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => copyCmd('codex login')}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="font-medium mb-1">3. Cole o conteúdo do <code>~/.codex/auth.json</code> abaixo:</p>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 bg-muted px-2 py-1.5 rounded font-mono text-[11px]">
                      cat ~/.codex/auth.json | pbcopy
                    </code>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => copyCmd('cat ~/.codex/auth.json | pbcopy')}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    No Mac/Linux. No Windows: <code>type %USERPROFILE%\.codex\auth.json | clip</code>
                  </p>
                </div>
              </div>

              <div>
                <Label>Conteúdo do auth.json</Label>
                <Textarea
                  value={authJsonPaste}
                  onChange={(e) => setAuthJsonPaste(e.target.value)}
                  placeholder='{"auth_mode":"chatgpt","tokens":{"id_token":"...","access_token":"...","refresh_token":"...","account_id":"..."}}'
                  className="mt-1.5 font-mono text-[10px] h-32"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  ⚠️ Token é privado — não compartilha com ninguém. Nós salvamos criptografado.
                </p>
              </div>
            </>
          )}

          {/* API Key + campos extras (dinâmico baseado em info.fields) */}
          {providerType !== 'openai_codex' && info?.fields && (
            <div className="space-y-3">
              {info.setup_steps && info.setup_steps.length > 0 && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs">
                  <p className="font-semibold mb-1.5">Como configurar:</p>
                  <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                    {info.setup_steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              )}
              {info.setup_url && (
                <a href={info.setup_url} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />
                  Onde achar a chave →
                </a>
              )}

              {info.fields.map((f) => {
                // Campo "principal" (api_key OU token) usa o state apiKey;
                // demais usam extraFields. Mapeado pelo nome real do schema.
                const primary = info.fields!.find((x) => x.name === 'api_key' || x.name === 'token') || info.fields![0];
                const isPrimary = f.name === primary.name;
                const value = isPrimary ? apiKey : (extraFields[f.name] || '');
                const setValue = (v: string) => {
                  if (isPrimary) setApiKey(v);
                  else setExtraFields((prev) => ({ ...prev, [f.name]: v }));
                };
                return (
                  <div key={f.name}>
                    <Label className="text-xs">
                      {f.label}{f.required ? ' *' : ' (opcional)'}
                    </Label>
                    <Input
                      type={f.type === 'password' ? 'password' : 'text'}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder={f.placeholder}
                      className="mt-1.5 font-mono text-xs"
                    />
                    {f.help && <p className="text-[10px] text-muted-foreground mt-1">{f.help}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Shared */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox" id="shared"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <Label htmlFor="shared" className="cursor-pointer text-sm">
              Compartilhar com o time (outros usuários veem essa credencial)
            </Label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm" onClick={onSave} disabled={isSaving || importing}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {(isSaving || importing) ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar credencial'}
          </Button>
        </div>
      </div>
    </>
  );
}

function decodeJwtPayload(jwt: string): Record<string, any> | null {
  try {
    const [, payload] = jwt.split('.');
    if (!payload) return null;
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch { return null; }
}

/** Removido — agora usa info.fields[].help direto */
function _legacyGetHint(): string {
  return '';
}
