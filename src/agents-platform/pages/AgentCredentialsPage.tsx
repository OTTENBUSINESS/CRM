/**
 * AgentCredentialsPage — gerencia credenciais de providers IA.
 * Rota: /agentes/credenciais
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, KeyRound, Plus, Trash2, ChevronLeft, X, Check, AlertCircle, ExternalLink, Copy } from 'lucide-react';
import {
  useCredentials, PROVIDER_LABELS, type ProviderType, type ProviderCredential,
} from '../hooks/useCredentials';
import { useToast } from '@/hooks/use-toast';
import { NewCredentialDialog } from '../components/NewCredentialDialog';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function AgentCredentialsPage() {
  const { credentials, loading, remove } = useCredentials();
  const [addOpen, setAddOpen] = useState(false);

  const handleDelete = (cred: ProviderCredential) => {
    if (!confirm(`Apagar credencial "${cred.label}"? Agentes que usam vão parar de funcionar.`)) return;
    remove(cred.id);
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/agentes" className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Credenciais</h1>
              <p className="text-sm text-muted-foreground">
                {credentials.length} cadastrada{credentials.length !== 1 ? 's' : ''} · multi-provider
              </p>
            </div>
          </div>
          <Button
            size="sm" onClick={() => setAddOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Adicionar credencial
          </Button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : credentials.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <KeyRound className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground mb-3">Nenhuma credencial ainda.</p>
            <Button size="sm" onClick={() => setAddOpen(true)}>+ Adicionar primeira</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {credentials.map((c) => {
              const info = PROVIDER_LABELS[c.provider_type];
              const isCodex = c.provider_type === 'openai_codex';
              const expiresAt = isCodex && c.auth_data?.expires_at
                ? new Date(c.auth_data.expires_at * 1000)
                : null;
              const expired = expiresAt && expiresAt < new Date();
              const expiringSoon = expiresAt && !expired && expiresAt.getTime() - Date.now() < 86400_000 * 3;
              return (
                <div key={c.id} className="border border-border rounded-xl bg-card p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="text-2xl shrink-0">{info?.emoji || '🔧'}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{c.label}</h3>
                          {c.is_active ? (
                            <Badge variant="outline" className="h-5 text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
                              <span className="h-1 w-1 rounded-full bg-emerald-500" /> Ativo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="h-5 text-[10px]">Inativo</Badge>
                          )}
                          {expired && <Badge variant="outline" className="h-5 text-[10px] border-red-500/30 text-red-600">Expirado</Badge>}
                          {expiringSoon && !expired && <Badge variant="outline" className="h-5 text-[10px] border-amber-500/30 text-amber-600">Expira em breve</Badge>}
                          {c.is_shared && <Badge variant="outline" className="h-5 text-[10px]">Compartilhada</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{info?.name}</p>
                        {isCodex && c.metadata?.plan_type && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Plano: <span className="font-mono">{c.metadata.plan_type}</span>
                            {c.metadata.email && <> · {c.metadata.email}</>}
                            {expiresAt && <> · Token expira {format(expiresAt, 'dd/MM HH:mm', { locale: ptBR })}</>}
                          </p>
                        )}
                        {c.last_used_at && (
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            Último uso: {formatDistanceToNow(new Date(c.last_used_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600 shrink-0"
                      onClick={() => handleDelete(c)} title="Apagar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {addOpen && <NewCredentialDialog onClose={() => setAddOpen(false)} />}
      </div>
    </AppLayout>
  );
}

