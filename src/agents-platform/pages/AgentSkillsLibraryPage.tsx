/**
 * AgentSkillsLibraryPage — biblioteca global de habilidades (catálogo).
 * Rota: /agentes/habilidades
 *
 * Mostra TODAS as skills do catálogo agrupadas por pack/provider, com:
 *  - "usada em N agentes"
 *  - status da credencial do provider
 *  - editar descrição/schema (abre drawer)
 *  - criar habilidade nova no catálogo
 *
 * Best practice: igual "biblioteca de nodes" do n8n / "apps" do Zapier.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft, Loader2, Package, Search, Plus, Bot,
  CheckCircle2, AlertCircle, ExternalLink, Wrench,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSkillCatalog, type CatalogSkill } from '../hooks/useSkillCatalog';
import { cn } from '@/lib/utils';

interface IntegrationProvider {
  slug: string;
  display_name: string;
  description: string;
  icon: string;
  category: string;
  credential_type: string | null;
  setup_url: string | null;
}

export default function AgentSkillsLibraryPage() {
  const { data: catalog = [], isLoading } = useSkillCatalog();
  const [search, setSearch] = useState('');

  const { data: providers = [] } = useQuery({
    queryKey: ['integration-providers'],
    queryFn: async (): Promise<IntegrationProvider[]> => {
      const { data } = await supabase
        .from('agents_integration_providers')
        .select('*')
        .eq('is_active', true)
        .order('category');
      return (data as IntegrationProvider[]) || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: creds = new Set<string>() } = useQuery({
    queryKey: ['credential-types'],
    queryFn: async () => {
      const { data } = await supabase.from('agents_provider_credentials').select('provider_type').eq('is_active', true);
      const s = new Set<string>();
      (data || []).forEach((c: any) => s.add(c.provider_type));
      return s;
    },
    staleTime: 60_000,
  });

  // Contagem de uso por skill (quantos agentes usam)
  const { data: usageCounts = {} } = useQuery({
    queryKey: ['skill-usage-counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data } = await supabase.from('agents_tools').select('name');
      const counts: Record<string, number> = {};
      (data || []).forEach((t: any) => { counts[t.name] = (counts[t.name] || 0) + 1; });
      return counts;
    },
    staleTime: 30_000,
  });

  const filtered = catalog.filter((s) =>
    !search ||
    s.display_name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase()) ||
    (s.provider || '').toLowerCase().includes(search.toLowerCase()),
  );

  const byProvider = filtered.reduce<Record<string, CatalogSkill[]>>((acc, s) => {
    const key = s.provider || 'core';
    (acc[key] ||= []).push(s);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/agentes" className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Biblioteca de Habilidades</h1>
              <p className="text-sm text-muted-foreground">{catalog.length} habilidades · usadas pelos agentes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/agentes/credenciais" className="gap-1.5">
                🔑 Conexões
              </Link>
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-5 relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar habilidade ou pack..."
            className="pl-9"
          />
        </div>

        {/* Lista por pack */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byProvider).map(([providerSlug, skills]) => {
              const provider = providers.find((p) => p.slug === providerSlug);
              const credNeeded = provider?.credential_type;
              const credOk = !credNeeded || creds.has(credNeeded);

              return (
                <div key={providerSlug} className="border border-border rounded-xl bg-card overflow-hidden">
                  {/* Pack header */}
                  <div className="p-4 border-b border-border flex items-center gap-3 bg-muted/20">
                    <span className="text-2xl">{provider?.icon || '🔌'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">{provider?.display_name || providerSlug}</h3>
                        <Badge variant="outline" className="h-5 text-[10px]">{skills.length} tools</Badge>
                        {credNeeded && (
                          credOk ? (
                            <Badge variant="outline" className="h-5 text-[10px] border-emerald-500/40 text-emerald-700 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Conectado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="h-5 text-[10px] border-red-500/40 text-red-600 gap-1">
                              <AlertCircle className="h-3 w-3" /> Sem conexão
                            </Badge>
                          )
                        )}
                      </div>
                      {provider?.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{provider.description}</p>
                      )}
                    </div>
                    {provider?.setup_url && (
                      <a href={provider.setup_url} target="_blank" rel="noreferrer"
                         className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0">
                        <ExternalLink className="h-3 w-3" /> Docs
                      </a>
                    )}
                  </div>

                  {/* Skills do pack */}
                  <div className="divide-y divide-border/50">
                    {skills.map((s) => {
                      const usage = usageCounts[s.slug] || 0;
                      return (
                        <div key={s.id} className="p-3 flex items-start gap-3 hover:bg-muted/20 transition-colors">
                          <span className="text-lg shrink-0">{s.emoji || '🤖'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{s.display_name}</span>
                              <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">{s.slug}</code>
                              {s.is_recommended && (
                                <Badge variant="outline" className="h-4 text-[9px] border-primary/30 text-primary">⭐</Badge>
                              )}
                              <Badge variant="outline" className="h-4 text-[9px]">{s.action_type}</Badge>
                              {s.default_usage_mode === 'with_approval' && (
                                <Badge variant="outline" className="h-4 text-[9px] border-amber-500/30 text-amber-600">aprovação</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            {usage > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Bot className="h-3 w-3" />
                                {usage} {usage === 1 ? 'agente' : 'agentes'}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/50">não usada</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rodapé informativo */}
        <div className="mt-6 rounded-lg border border-dashed border-border p-4 text-center">
          <Wrench className="h-5 w-5 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Pra adicionar uma habilidade num agente, vai em <strong>Agente → aba Tools → Adicionar</strong>.
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Aqui é a visão geral de tudo que existe. As conexões (API keys) ficam em{' '}
            <Link to="/agentes/credenciais" className="text-primary hover:underline">Conexões</Link>.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
