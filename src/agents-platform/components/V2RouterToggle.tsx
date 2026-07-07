/**
 * V2RouterToggle — card visível no topo da lista de agentes com toggle do roteador WhatsApp V2.
 *
 * Funcionamento:
 *  - OFF (default): 100% mensagens WhatsApp vão pro ai-sales-agent legado (estado seguro).
 *  - ON: webhook tenta lookup nos agents_deployments (match priority asc). Se acha → agent-runner novo.
 *
 * Best practices UX:
 *  - Estado claro: ✅ ATIVO (verde) vs ⏸ INATIVO (cinza)
 *  - Mostra contagem de deployments WhatsApp ativos pra contexto
 *  - Confirmação dupla pra ATIVAR (afeta produção)
 *  - Logs visíveis ao lado (link pra audit)
 *  - Bloqueio se nenhum deployment WhatsApp ativo (evita ativar inútil)
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldAlert, Zap, CheckCircle2, MessageSquare, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface RouterStatus {
  enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

interface DeploymentSummary {
  id: string;
  slug: string;
  display_name: string;
  emoji: string | null;
  priority: number;
}

export function V2RouterToggle() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 1. Estado do toggle
  // Otten: config.value é TEXT (não jsonb). A flag é o texto literal 'true'/'false'.
  const { data: status, isLoading: loadingStatus } = useQuery({
    queryKey: ['v2-router-status'],
    queryFn: async (): Promise<RouterStatus> => {
      const { data } = await supabase
        .from('config')
        .select('value')
        .eq('key', 'agent_platform_v2_enabled')
        .maybeSingle();
      const raw = (data?.value ?? null) as string | null;
      return {
        enabled: raw === 'true',
        updated_at: null,
        updated_by: null,
      };
    },
    staleTime: 30_000,
  });

  // 2. Deployments WhatsApp ativos
  const { data: deployments = [] } = useQuery({
    queryKey: ['whatsapp-deployments-active'],
    queryFn: async (): Promise<DeploymentSummary[]> => {
      const { data } = await supabase
        .from('agents_deployments')
        .select('id, config, agents_registry!inner(slug, display_name, emoji)')
        .eq('channel', 'whatsapp')
        .eq('is_active', true);
      return ((data || []) as any[]).map((d) => ({
        id: d.id,
        slug: d.agents_registry.slug,
        display_name: d.agents_registry.display_name,
        emoji: d.agents_registry.emoji,
        priority: Number(d.config?.priority ?? 100),
      })).sort((a, b) => a.priority - b.priority);
    },
    staleTime: 30_000,
  });

  // 3. Audit log recente
  const { data: logCount = 0 } = useQuery({
    queryKey: ['routing-log-recent-count'],
    queryFn: async (): Promise<number> => {
      const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const { count } = await supabase
        .from('agent_routing_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  // 4. Mutation pra atualizar
  // Otten: config.value é TEXT → grava o texto literal 'true'/'false' via upsert.
  const toggleMutation = useMutation({
    mutationFn: async (newEnabled: boolean) => {
      const { error } = await supabase
        .from('config')
        .upsert(
          { key: 'agent_platform_v2_enabled', value: newEnabled ? 'true' : 'false' },
          { onConflict: 'key' },
        );
      if (error) throw error;
    },
    onSuccess: (_, newEnabled) => {
      qc.invalidateQueries({ queryKey: ['v2-router-status'] });
      toast({
        title: newEnabled ? 'Roteador V2 ATIVADO' : 'Roteador V2 desativado',
        description: newEnabled
          ? `Próxima msg WhatsApp tenta lookup em ${deployments.length} deployments ativos.`
          : 'Todas msgs WhatsApp vão pro ai-sales-agent legado.',
      });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  const enabled = status?.enabled === true;
  const noDeployments = deployments.length === 0;

  const onToggleClick = (next: boolean) => {
    if (next) {
      // Pra ATIVAR: confirmação dupla
      if (noDeployments) {
        toast({
          title: 'Nenhum deployment WhatsApp ativo',
          description: 'Ative pelo menos 1 deployment WhatsApp num agente (aba Canais) antes de ligar o roteador.',
          variant: 'destructive',
        });
        return;
      }
      setConfirmOpen(true);
    } else {
      // Desativar: imediato (rollback é seguro)
      toggleMutation.mutate(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className={cn(
        'rounded-xl border p-4 mb-6 transition-colors',
        enabled
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-border bg-muted/30',
      )}>
        <div className="flex items-start gap-4 flex-wrap">
          {/* Ícone + título */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
              enabled
                ? 'bg-emerald-500/15 text-emerald-600'
                : 'bg-muted text-muted-foreground',
            )}>
              {enabled ? <Zap className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold">Roteador WhatsApp V2</h3>
                {enabled ? (
                  <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    ATIVO
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">INATIVO</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                {enabled
                  ? 'Mensagens WhatsApp tentam lookup nesta plataforma. Se acha match → agent-runner novo. Senão → ai-sales-agent legado (fallback seguro).'
                  : 'Todas mensagens WhatsApp vão pro ai-sales-agent legado. Ative pra começar a rotear pra agentes V2.'}
              </p>

              {/* Status detalhado */}
              <div className="flex items-center gap-4 mt-2 text-[11px] flex-wrap">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  {deployments.length} {deployments.length === 1 ? 'agente WhatsApp ativo' : 'agentes WhatsApp ativos'}
                </span>
                {enabled && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <History className="h-3 w-3" />
                    {logCount} decisões nas últimas 24h
                  </span>
                )}
                {status?.updated_at && (
                  <span className="text-muted-foreground">
                    Atualizado: {new Date(status.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              {/* Lista de agentes ativos */}
              {deployments.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  {deployments.map((d) => (
                    <span
                      key={d.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background text-[10px]"
                    >
                      {d.emoji && <span>{d.emoji}</span>}
                      <span className="font-medium">{d.display_name}</span>
                      <span className="text-muted-foreground font-mono">pri={d.priority}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Toggle */}
          <div className="flex items-center gap-3 shrink-0">
            {toggleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <span className={cn('text-xs font-medium', enabled ? 'text-emerald-600' : 'text-muted-foreground')}>
              {enabled ? 'Ativo' : 'Desativado'}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={onToggleClick}
              disabled={toggleMutation.isPending}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Dialog confirmação dupla pra ATIVAR */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Ativar Roteador V2 em produção?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Mensagens chegando no WhatsApp <strong>IAP-OFICIAL</strong> vão começar
                  a ser avaliadas pela nova plataforma.
                </p>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                  <p className="font-medium text-amber-700 dark:text-amber-300 mb-2">
                    🛡 Garantias:
                  </p>
                  <ul className="space-y-1 text-amber-700/90 dark:text-amber-300/90">
                    <li>• Lookup tenta match nos {deployments.length} agentes ativos</li>
                    <li>• Se nenhum bate → cai no <strong>ai-sales-agent legado</strong> (fallback)</li>
                    <li>• Leads com <code className="text-[10px]">metadata.use_legacy_platform=true</code> ficam no legado</li>
                    <li>• Rollback: desliga este toggle e volta tudo em &lt;1s</li>
                  </ul>
                </div>

                <p className="text-muted-foreground text-xs">
                  Toda decisão fica gravada em <code className="text-[10px]">agent_routing_log</code> pra audit.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                toggleMutation.mutate(true);
              }}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              ✅ Ativar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
