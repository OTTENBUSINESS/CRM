/**
 * SkillCatalogModal — agrupa skills por PACK/PROVIDER (best practice n8n/Zapier).
 *
 * Layout:
 *   - Lista por provider (BoraPostar, Buffer, ScrapeCreators…)
 *   - Card do pack mostra: nome, descrição, contagem de tools, providers needed
 *   - Botão "Instalar pack" adiciona TODAS as tools do pack de uma vez
 *   - Toggle "Ver individuais" abre lista granular pra adicionar 1 só
 *
 * Detecta se a credencial do provider já tá cadastrada — se não, avisa.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { X, Plus, Sparkles, Loader2, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSkillCatalog, type CatalogSkill } from '../hooks/useSkillCatalog';
import { useAgentTools } from '../hooks/useAgentTools';
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

export function SkillCatalogModal({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const { data: catalog = [], isLoading } = useSkillCatalog();
  const { tools: existing, saveTool, isSaving } = useAgentTools(agentId);
  const [search, setSearch] = useState('');
  const [expandedPack, setExpandedPack] = useState<string | null>(null);
  const [individualMode, setIndividualMode] = useState(false);

  // Providers (packs)
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

  // Credenciais cadastradas (pra checar status do pack)
  const { data: creds = [] } = useQuery({
    queryKey: ['credential-types'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agents_provider_credentials')
        .select('provider_type')
        .eq('is_active', true);
      const set = new Set<string>();
      (data || []).forEach((c: any) => set.add(c.provider_type));
      return set;
    },
    staleTime: 60_000,
  });

  const existingNames = new Set(existing.map((t) => t.name));

  // Filtra catalog
  const filtered = catalog.filter((s) =>
    !search ||
    s.display_name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase()) ||
    (s.provider || '').toLowerCase().includes(search.toLowerCase()),
  );

  // Agrupa por provider
  const byProvider = filtered.reduce<Record<string, CatalogSkill[]>>((acc, s) => {
    const key = s.provider || 'core';
    (acc[key] ||= []).push(s);
    return acc;
  }, {});

  const installPack = async (skills: CatalogSkill[]) => {
    const toAdd = skills.filter((s) => !existingNames.has(s.slug));
    for (const skill of toAdd) {
      await new Promise<void>((resolve) => {
        saveTool(
          {
            agent_id: agentId,
            name: skill.slug,
            description: skill.description,
            parameters_schema: skill.parameters_schema,
            action_type: skill.action_type,
            action_config: skill.action_config,
            usage_mode: skill.default_usage_mode,
            // @ts-expect-error provider extra (legacy schema)
            provider: skill.provider,
          } as any,
          { onSuccess: () => resolve(), onError: () => resolve() },
        );
      });
    }
  };

  const installSingle = async (skill: CatalogSkill) => {
    if (existingNames.has(skill.slug)) return;
    saveTool(
      {
        agent_id: agentId,
        name: skill.slug,
        description: skill.description,
        parameters_schema: skill.parameters_schema,
        action_type: skill.action_type,
        action_config: skill.action_config,
        usage_mode: skill.default_usage_mode,
      } as any,
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-4 top-[5vh] bottom-[5vh] max-w-3xl mx-auto bg-background border border-border rounded-2xl z-50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Adicionar habilidades</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Instala um pack inteiro (recomendado) ou escolhe tools individuais.
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search + toggle */}
        <div className="px-5 pt-4 flex items-center gap-3">
          <Input
            placeholder="Buscar pack ou habilidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Button
            size="sm" variant="outline"
            onClick={() => setIndividualMode((v) => !v)}
            className="gap-1.5 text-xs"
          >
            {individualMode ? '📦 Por pack' : '🔧 Individuais'}
          </Button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(byProvider).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">Nenhuma habilidade encontrada</p>
          ) : (
            Object.entries(byProvider).map(([providerSlug, skills]) => {
              const provider = providers.find((p) => p.slug === providerSlug);
              const allInstalled = skills.every((s) => existingNames.has(s.slug));
              const partialInstalled = !allInstalled && skills.some((s) => existingNames.has(s.slug));
              const credNeeded = provider?.credential_type;
              const credOk = !credNeeded || creds.has(credNeeded);
              const isExpanded = expandedPack === providerSlug || individualMode;

              return (
                <div
                  key={providerSlug}
                  className={cn(
                    'border rounded-xl bg-card overflow-hidden transition-all',
                    allInstalled ? 'border-emerald-500/30' : partialInstalled ? 'border-amber-500/30' : 'border-border',
                  )}
                >
                  {/* Header do pack */}
                  <div className="p-3 flex items-center gap-3">
                    <span className="text-2xl shrink-0">{provider?.icon || '🔌'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">
                          {provider?.display_name || providerSlug}
                        </h3>
                        <Badge variant="outline" className="h-5 text-[10px]">
                          {skills.length} {skills.length === 1 ? 'tool' : 'tools'}
                        </Badge>
                        {allInstalled && (
                          <Badge variant="outline" className="h-5 text-[10px] border-emerald-500/40 text-emerald-700 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Instalado
                          </Badge>
                        )}
                        {partialInstalled && (
                          <Badge variant="outline" className="h-5 text-[10px] border-amber-500/40 text-amber-700">
                            Parcial ({skills.filter((s) => existingNames.has(s.slug)).length}/{skills.length})
                          </Badge>
                        )}
                        {credNeeded && !credOk && (
                          <Badge variant="outline" className="h-5 text-[10px] border-red-500/40 text-red-600 gap-1">
                            <AlertCircle className="h-3 w-3" /> Falta conexão
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {provider?.description || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!individualMode && !allInstalled && (
                        <Button
                          size="sm"
                          onClick={() => installPack(skills)}
                          disabled={isSaving}
                          className="bg-primary hover:bg-primary text-white gap-1.5 h-8 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {partialInstalled ? 'Completar' : 'Instalar pack'}
                        </Button>
                      )}
                      {!individualMode && (
                        <Button
                          size="icon" variant="ghost" className="h-8 w-8"
                          onClick={() => setExpandedPack(expandedPack === providerSlug ? null : providerSlug)}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Lista de tools (expandido OU modo individual) */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/10 p-3 space-y-1.5">
                      {credNeeded && !credOk && (
                        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 mb-2 text-[11px] text-red-700 dark:text-red-400 flex items-start gap-2">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <div>
                            <strong>Conexão {provider?.display_name} não cadastrada.</strong>{' '}
                            Tools vão falhar até cadastrar.{' '}
                            {provider?.setup_url && (
                              <a href={provider.setup_url} target="_blank" rel="noreferrer" className="underline">
                                Onde achar a chave →
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                      {skills.map((s) => {
                        const exists = existingNames.has(s.slug);
                        return (
                          <div
                            key={s.id}
                            className={cn(
                              'p-2 rounded-md border bg-background flex items-start gap-2 transition-all',
                              exists ? 'border-emerald-500/20 opacity-60' : 'border-border',
                            )}
                          >
                            <span className="text-lg shrink-0">{s.emoji || '🤖'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium">{s.display_name}</span>
                                {s.is_recommended && (
                                  <Badge variant="outline" className="h-4 text-[9px] border-primary/30 text-primary">⭐</Badge>
                                )}
                                {s.default_usage_mode === 'with_approval' && (
                                  <Badge variant="outline" className="h-4 text-[9px] border-amber-500/30 text-amber-600">aprovação</Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{s.description}</p>
                            </div>
                            {exists ? (
                              <Badge variant="outline" className="h-5 text-[10px] border-emerald-500/40 text-emerald-700 shrink-0">
                                <CheckCircle2 className="h-3 w-3 mr-0.5" /> Instalada
                              </Badge>
                            ) : (
                              <Button
                                size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                                onClick={() => installSingle(s)}
                                disabled={isSaving}
                                title="Adicionar só essa"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-card flex items-center justify-end">
          <Button size="sm" variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </>
  );
}
