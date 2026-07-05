import { useState, useMemo as useMemoLib } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Users, Filter, UserCheck, Search, MapPin, Target, Tag,
  TrendingUp, X, Sparkles, Mail, Phone, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AudienceFilters } from '@/types/campaign.types';
import {
  useAudienceCount,
  useAudienceSample,
  usePipelineStages,
  useDistinctCities,
  useDistinctStates,
  useDistinctUtmSources,
  useDistinctUtmCampaigns,
} from '@/hooks/useCampaigns';
import { useTeamMembers } from '@/hooks/useTeamMembers';

interface Props {
  filters: AudienceFilters;
  onChange: (filters: AudienceFilters) => void;
  /** Quando o canal é cloud_api, leads sem janela aberta também podem receber template */
  channelHint?: 'uazapi' | 'cloud_api';
}

export default function AudiencePicker({ filters, onChange, channelHint }: Props) {
  const initialMode: 'filter' | 'specific' = (filters.exclude_lead_ids?.length ?? 0) > 0
    || (Object.keys(filters).filter((k) => k !== 'exclude_lead_ids').length === 0 && !!(filters as any).lead_ids?.length)
    ? 'specific'
    : 'filter';
  const [mode, setMode] = useState<'filter' | 'specific'>(initialMode);
  const [stageSearch, setStageSearch] = useState('');
  const [leadSearch, setLeadSearch] = useState('');

  const updateFilter = (key: keyof AudienceFilters, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  const toggleArrayItem = (key: keyof AudienceFilters, item: string) => {
    const current = (filters[key] as string[]) || [];
    const next = current.includes(item) ? current.filter((i) => i !== item) : [...current, item];
    updateFilter(key, next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'filter' | 'specific')}>
        <TabsList className="grid grid-cols-2 max-w-sm">
          <TabsTrigger value="filter" className="gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5" /> Por filtro
          </TabsTrigger>
          <TabsTrigger value="specific" className="gap-1.5 text-xs">
            <UserCheck className="h-3.5 w-3.5" /> Leads específicos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="filter" className="mt-4">
          <FilterMode
            filters={filters}
            updateFilter={updateFilter}
            toggleArrayItem={toggleArrayItem}
            stageSearch={stageSearch}
            setStageSearch={setStageSearch}
          />
        </TabsContent>

        <TabsContent value="specific" className="mt-4">
          <SpecificMode
            leadIds={(filters as any).lead_ids || []}
            onChange={(ids) =>
              onChange(ids.length > 0 ? { lead_ids: ids } : {})
            }
            leadSearch={leadSearch}
            setLeadSearch={setLeadSearch}
          />
        </TabsContent>
      </Tabs>

      {/* Preview agregado sempre visível */}
      <AudiencePreview filters={filters} mode={mode} channelHint={channelHint} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MODO FILTRO
// ─────────────────────────────────────────────────────────────────

function FilterMode({
  filters, updateFilter, toggleArrayItem, stageSearch, setStageSearch,
}: any) {
  const { data: stages } = usePipelineStages();
  const { data: cities } = useDistinctCities();
  const { data: states } = useDistinctStates();
  const { data: utmSources } = useDistinctUtmSources();
  const { data: utmCampaigns } = useDistinctUtmCampaigns();
  const { data: teamMembers } = useTeamMembers();

  // Group stages by pipeline (com busca)
  const pipelineGroups = (stages || [])
    .filter((s: any) => !stageSearch || s.name.toLowerCase().includes(stageSearch.toLowerCase()) || s.sales_pipelines?.name.toLowerCase().includes(stageSearch.toLowerCase()))
    .reduce((acc: Record<string, any[]>, stage: any) => {
      const pName = stage.sales_pipelines?.name || 'Sem Pipeline';
      if (!acc[pName]) acc[pName] = [];
      acc[pName].push(stage);
      return acc;
    }, {});

  const selectedCount =
    (filters.pipeline_stage_ids?.length || 0) +
    (filters.states?.length || 0) +
    (filters.cities?.length || 0) +
    (filters.utm_sources?.length || 0) +
    (filters.utm_campaigns?.length || 0) +
    (filters.sales_rep_ids?.length || 0) +
    (filters.score_min !== undefined ? 1 : 0) +
    (filters.score_max !== undefined ? 1 : 0) +
    (filters.capital_min !== undefined ? 1 : 0) +
    (filters.capital_max !== undefined ? 1 : 0) +
    (filters.created_after ? 1 : 0) +
    (filters.created_before ? 1 : 0) +
    (filters.last_interaction_after ? 1 : 0) +
    (filters.last_interaction_before ? 1 : 0) +
    (filters.no_sales_rep ? 1 : 0) +
    (filters.bant_budget ? 1 : 0) +
    (filters.bant_authority ? 1 : 0) +
    (filters.bant_need ? 1 : 0) +
    (filters.bant_timeline ? 1 : 0);

  return (
    <Accordion type="multiple" defaultValue={['pipeline']} className="space-y-2">
      {/* PIPELINE */}
      <AccordionItem value="pipeline" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            Pipeline & Etapas
            {(filters.pipeline_stage_ids?.length || 0) > 0 && (
              <Badge variant="secondary" className="text-[10px]">{filters.pipeline_stage_ids.length}</Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3">
          <PipelineStagePicker
            stages={stages || []}
            selectedStageIds={filters.pipeline_stage_ids || []}
            onToggleStage={(stageId) => toggleArrayItem('pipeline_stage_ids', stageId)}
            onSetAllStages={(ids) => updateFilter('pipeline_stage_ids', ids.length > 0 ? ids : undefined)}
          />
        </AccordionContent>
      </AccordionItem>

      {/* LOCALIZAÇÃO */}
      <AccordionItem value="location" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Localização
            {((filters.states?.length || 0) + (filters.cities?.length || 0)) > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {(filters.states?.length || 0) + (filters.cities?.length || 0)}
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Estados</Label>
            <div className="flex flex-wrap gap-1">
              {(states || []).map((s: string) => (
                <Badge
                  key={s}
                  variant={(filters.states || []).includes(s) ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer text-xs',
                    (filters.states || []).includes(s) && 'bg-[#BAA05E] hover:bg-[#917D3D]',
                  )}
                  onClick={() => toggleArrayItem('states', s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Cidades</Label>
            <ScrollArea className="max-h-32">
              <div className="flex flex-wrap gap-1">
                {(cities || []).slice(0, 60).map((c: string) => (
                  <Badge
                    key={c}
                    variant={(filters.cities || []).includes(c) ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer text-xs',
                      (filters.cities || []).includes(c) && 'bg-[#BAA05E] hover:bg-[#917D3D]',
                    )}
                    onClick={() => toggleArrayItem('cities', c)}
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ORIGEM (UTM) */}
      <AccordionItem value="utm" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            Origem (UTM)
            {((filters.utm_sources?.length || 0) + (filters.utm_campaigns?.length || 0)) > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {(filters.utm_sources?.length || 0) + (filters.utm_campaigns?.length || 0)}
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">UTM Source</Label>
            <div className="flex flex-wrap gap-1">
              {(utmSources || []).slice(0, 30).map((s: string) => (
                <Badge
                  key={s}
                  variant={(filters.utm_sources || []).includes(s) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleArrayItem('utm_sources', s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">UTM Campaign</Label>
            <div className="flex flex-wrap gap-1">
              {(utmCampaigns || []).slice(0, 30).map((c: string) => (
                <Badge
                  key={c}
                  variant={(filters.utm_campaigns || []).includes(c) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleArrayItem('utm_campaigns', c)}
                >
                  {c}
                </Badge>
              ))}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* SCORE & CAPITAL & BANT */}
      <AccordionItem value="qualification" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            Qualificação
            {((filters.bant_budget ? 1 : 0) + (filters.bant_authority ? 1 : 0) + (filters.bant_need ? 1 : 0) + (filters.bant_timeline ? 1 : 0)) > 0 && (
              <Badge variant="secondary" className="text-[10px]">BANT</Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Score (0-100)</Label>
              <div className="flex gap-1.5">
                <Input
                  type="number" placeholder="Min" className="h-8 text-xs"
                  value={filters.score_min ?? ''}
                  onChange={(e) => updateFilter('score_min', e.target.value ? Number(e.target.value) : undefined)}
                />
                <Input
                  type="number" placeholder="Max" className="h-8 text-xs"
                  value={filters.score_max ?? ''}
                  onChange={(e) => updateFilter('score_max', e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Capital (R$)</Label>
              <div className="flex gap-1.5">
                <Input
                  type="number" placeholder="Min" className="h-8 text-xs"
                  value={filters.capital_min ?? ''}
                  onChange={(e) => updateFilter('capital_min', e.target.value ? Number(e.target.value) : undefined)}
                />
                <Input
                  type="number" placeholder="Max" className="h-8 text-xs"
                  value={filters.capital_max ?? ''}
                  onChange={(e) => updateFilter('capital_max', e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">BANT</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['bant_budget', 'bant_authority', 'bant_need', 'bant_timeline'] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={filters[key] || false}
                    onCheckedChange={(checked) => updateFilter(key, checked ? true : undefined)}
                  />
                  <span className="capitalize">{key.replace('bant_', '')}</span>
                </label>
              ))}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* VENDEDOR & DATAS */}
      <AccordionItem value="advanced" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            Vendedor & Datas
            {((filters.sales_rep_ids?.length || 0) + (filters.no_sales_rep ? 1 : 0) + (filters.created_after ? 1 : 0) + (filters.created_before ? 1 : 0)) > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {(filters.sales_rep_ids?.length || 0) + (filters.no_sales_rep ? 1 : 0)}
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Vendedor responsável</Label>
            <ScrollArea className="max-h-32">
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={filters.no_sales_rep || false}
                    onCheckedChange={(c) => updateFilter('no_sales_rep', c ? true : undefined)}
                  />
                  <span className="italic text-muted-foreground">Sem responsável</span>
                </label>
                {(teamMembers || []).map((m: any) => (
                  <label key={m.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={(filters.sales_rep_ids || []).includes(m.id)}
                      onCheckedChange={() => toggleArrayItem('sales_rep_ids', m.id)}
                    />
                    <span>{m.name}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Cadastrado de</Label>
              <Input
                type="date" className="h-8 text-xs"
                value={filters.created_after?.split('T')[0] || ''}
                onChange={(e) => updateFilter('created_after', e.target.value ? `${e.target.value}T00:00:00-03:00` : undefined)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Cadastrado até</Label>
              <Input
                type="date" className="h-8 text-xs"
                value={filters.created_before?.split('T')[0] || ''}
                onChange={(e) => updateFilter('created_before', e.target.value ? `${e.target.value}T23:59:59-03:00` : undefined)}
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* EXCLUSÕES */}
      <AccordionItem value="exclusions" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
            Exclusões
            {filters.exclude_campaign_days !== undefined && (
              <Badge variant="secondary" className="text-[10px]">{filters.exclude_campaign_days}d</Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Excluir leads que receberam campanha nos últimos
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" placeholder="7" className="h-8 text-xs w-20"
                value={filters.exclude_campaign_days ?? ''}
                onChange={(e) => updateFilter('exclude_campaign_days', e.target.value ? Number(e.target.value) : undefined)}
              />
              <span className="text-xs text-muted-foreground">dias</span>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// ─────────────────────────────────────────────────────────────────
// MODO LEADS ESPECÍFICOS
// ─────────────────────────────────────────────────────────────────

function SpecificMode({ leadIds, onChange, leadSearch, setLeadSearch }: any) {
  const { data: searchResults = [], isLoading } = useQuery({
    queryKey: ['campaign-leads-search', leadSearch],
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('id, name, email, phone, city_name')
        .not('phone', 'is', null)
        .neq('phone', '')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (leadSearch.trim()) {
        const s = leadSearch.trim();
        q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: selectedLeads = [] } = useQuery({
    queryKey: ['campaign-leads-selected', leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, email, phone')
        .in('id', leadIds);
      if (error) throw error;
      return data || [];
    },
  });

  const toggleLead = (id: string) => {
    const next = leadIds.includes(id) ? leadIds.filter((x: string) => x !== id) : [...leadIds, id];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {selectedLeads.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-3 border rounded-lg bg-muted/30">
          {selectedLeads.map((l: any) => (
            <Badge key={l.id} variant="secondary" className="gap-1 pr-1">
              <span className="truncate max-w-[180px]">{l.name || l.phone}</span>
              <button
                onClick={() => toggleLead(l.id)}
                className="hover:bg-muted rounded-sm p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={leadSearch}
          onChange={(e) => setLeadSearch(e.target.value)}
          placeholder="Buscar por nome, email ou telefone…"
          className="pl-9"
        />
      </div>

      <ScrollArea className="h-72 border rounded-lg">
        {isLoading ? (
          <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
        ) : searchResults.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            {leadSearch ? 'Nenhum lead encontrado' : 'Nenhum lead com telefone'}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {searchResults.map((l: any) => {
              const checked = leadIds.includes(l.id);
              return (
                <label
                  key={l.id}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all',
                    checked ? 'bg-[#BAA05E]/10' : 'hover:bg-muted/50',
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleLead(l.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.name || '(sem nome)'}</p>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-2">
                      <Phone className="h-3 w-3" /> {l.phone}
                      {l.email && <><Mail className="h-3 w-3 ml-1" /> {l.email}</>}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PREVIEW SEMPRE VISÍVEL
// ─────────────────────────────────────────────────────────────────

function AudiencePreview({ filters, mode, channelHint }: { filters: AudienceFilters; mode: 'filter' | 'specific'; channelHint?: string }) {
  const { data: count, isLoading: countLoading } = useAudienceCount(filters);
  const { data: sample = [] } = useAudienceSample(filters);

  const isEmpty =
    mode === 'filter'
      ? Object.keys(filters).filter((k) => k !== 'lead_ids').every((k) => {
          const v = (filters as any)[k];
          if (Array.isArray(v)) return v.length === 0;
          return v === undefined || v === null || v === '' || v === false;
        })
      : ((filters as any).lead_ids?.length ?? 0) === 0;

  return (
    <div className="rounded-xl border bg-gradient-to-br from-[#BAA05E]/5 to-transparent p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#BAA05E]/15 flex items-center justify-center">
            <Users className="h-4 w-4 text-[#BAA05E]" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Audiência estimada</p>
            <p className="text-2xl font-semibold tabular-nums leading-none">
              {countLoading ? '...' : (count || 0).toLocaleString('pt-BR')}
            </p>
          </div>
        </div>
        {channelHint === 'uazapi' && (count || 0) > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1 text-amber-700 border-amber-200 bg-amber-50">
            <Sparkles className="h-3 w-3" />
            Só leads em janela de 24h receberão
          </Badge>
        )}
      </div>

      {isEmpty ? (
        <p className="text-xs text-muted-foreground italic">
          Defina filtros acima ou selecione leads específicos pra ver a audiência.
        </p>
      ) : sample.length > 0 ? (
        <div className="mt-3 pt-3 border-t border-border/60">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
            Exemplos · primeiros {sample.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sample.slice(0, 8).map((l: any) => (
              <Badge key={l.id} variant="outline" className="text-xs font-normal">
                {l.name || l.phone || 'Lead'}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PIPELINE → STAGE: escolhe pipeline primeiro, depois etapas dele
// ─────────────────────────────────────────────────────────────────

function PipelineStagePicker({
  stages, selectedStageIds, onToggleStage, onSetAllStages,
}: {
  stages: any[];
  selectedStageIds: string[];
  onToggleStage: (stageId: string) => void;
  onSetAllStages: (ids: string[]) => void;
}) {
  // Lista única de pipelines + suas etapas
  const pipelines = useMemoPipelines(stages);
  const [currentPipelineId, setCurrentPipelineId] = useState<string>(() => {
    // Auto-seleciona o pipeline da primeira etapa já marcada (se houver)
    if (selectedStageIds.length > 0) {
      const stage = stages.find((s) => s.id === selectedStageIds[0]);
      if (stage?.sales_pipelines?.id) return stage.sales_pipelines.id;
    }
    return pipelines[0]?.id || '';
  });

  const currentStages = pipelines.find((p) => p.id === currentPipelineId)?.stages || [];
  const allCurrentSelected = currentStages.length > 0 && currentStages.every((s: any) => selectedStageIds.includes(s.id));
  const someCurrentSelected = currentStages.some((s: any) => selectedStageIds.includes(s.id));

  const toggleAllOfPipeline = () => {
    const currentIds = currentStages.map((s: any) => s.id);
    if (allCurrentSelected) {
      // Remove só os do pipeline atual, mantém outros
      onSetAllStages(selectedStageIds.filter((id) => !currentIds.includes(id)));
    } else {
      // Adiciona todos do pipeline atual, mantém outros
      const merged = Array.from(new Set([...selectedStageIds, ...currentIds]));
      onSetAllStages(merged);
    }
  };

  if (pipelines.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-3">
        Nenhum pipeline configurado. Crie em Settings → Comercial → Pipelines.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Selector de pipeline */}
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">
          Pipeline
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {pipelines.map((p) => {
            const selectedInPipeline = p.stages.filter((s: any) => selectedStageIds.includes(s.id)).length;
            const active = p.id === currentPipelineId;
            return (
              <button
                key={p.id}
                onClick={() => setCurrentPipelineId(p.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5',
                  active
                    ? 'bg-[#BAA05E] text-white border-[#BAA05E]'
                    : 'hover:bg-muted/60 text-foreground border-border',
                )}
              >
                {p.name}
                {selectedInPipeline > 0 && (
                  <Badge variant="secondary" className={cn('text-[10px] h-4 px-1.5', active && 'bg-white/20 text-white border-0')}>
                    {selectedInPipeline}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Etapas do pipeline selecionado */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Etapas {currentStages.length > 0 && `· ${currentStages.length}`}
          </Label>
          {currentStages.length > 0 && (
            <button
              onClick={toggleAllOfPipeline}
              className="text-[11px] text-[#917D3D] hover:underline"
            >
              {allCurrentSelected ? 'Desmarcar todas' : 'Selecionar todas'}
            </button>
          )}
        </div>
        <ScrollArea className="max-h-72 border rounded-md">
          <div className="p-2 space-y-0.5">
            {currentStages.map((stage: any) => {
              const checked = selectedStageIds.includes(stage.id);
              return (
                <label
                  key={stage.id}
                  className={cn(
                    'flex items-center gap-2 text-xs cursor-pointer rounded px-2 py-1.5 transition-colors',
                    checked ? 'bg-[#BAA05E]/10' : 'hover:bg-muted/50',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleStage(stage.id)}
                  />
                  <span className="flex-1 truncate">{stage.name}</span>
                </label>
              );
            })}
            {currentStages.length === 0 && (
              <p className="text-xs text-muted-foreground italic px-2 py-3">
                Nenhuma etapa neste pipeline
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function useMemoPipelines(stages: any[]) {
  return useMemoLib(() => {
    const map = new Map<string, { id: string; name: string; stages: any[] }>();
    for (const s of stages) {
      const pId = s.sales_pipelines?.id;
      const pName = s.sales_pipelines?.name || 'Sem Pipeline';
      if (!pId) continue;
      if (!map.has(pId)) map.set(pId, { id: pId, name: pName, stages: [] });
      map.get(pId)!.stages.push(s);
    }
    return Array.from(map.values());
  }, [stages]);
}
