import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Filter, UserMinus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AudienceFilters } from '@/types/campaign.types';
import {
  useAudienceCount,
  usePipelineStages,
  useDistinctCities,
  useDistinctStates,
  useDistinctUtmSources,
  useDistinctUtmCampaigns,
} from '@/hooks/useCampaigns';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import ExcludeLeadsSection from './ExcludeLeadsSection';

interface Props {
  filters: AudienceFilters;
  onChange: (filters: AudienceFilters) => void;
}

export default function AudienceBuilder({ filters, onChange }: Props) {
  const { data: audienceCount, isLoading: countLoading } = useAudienceCount(filters);
  const { data: stages } = usePipelineStages();
  const { data: cities } = useDistinctCities();
  const { data: states } = useDistinctStates();
  const { data: utmSources } = useDistinctUtmSources();
  const { data: utmCampaigns } = useDistinctUtmCampaigns();
  const { data: teamMembers } = useTeamMembers();

  const updateFilter = (key: keyof AudienceFilters, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  const toggleArrayItem = (key: keyof AudienceFilters, item: string) => {
    const current = (filters[key] as string[]) || [];
    const next = current.includes(item)
      ? current.filter(i => i !== item)
      : [...current, item];
    updateFilter(key, next.length > 0 ? next : undefined);
  };

  // Group stages by pipeline
  const pipelineGroups = (stages || []).reduce((acc: Record<string, any[]>, stage: any) => {
    const pName = stage.sales_pipelines?.name || 'Sem Pipeline';
    if (!acc[pName]) acc[pName] = [];
    acc[pName].push(stage);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Audience count badge */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium">Leads encontrados</span>
        </div>
        <Badge variant="default" className="text-lg px-4 py-1">
          {countLoading ? '...' : (audienceCount || 0).toLocaleString('pt-BR')}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pipeline Stage */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Etapa do Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 max-h-48 overflow-y-auto space-y-3">
            {Object.entries(pipelineGroups).map(([pName, pStages]) => (
              <div key={pName}>
                <p className="text-xs font-medium text-muted-foreground mb-1">{pName}</p>
                <div className="space-y-1">
                  {pStages.map((stage: any) => (
                    <label key={stage.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <Checkbox
                        checked={(filters.pipeline_stage_ids || []).includes(stage.id)}
                        onCheckedChange={() => toggleArrayItem('pipeline_stage_ids', stage.id)}
                      />
                      <span>{stage.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Date Filters */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Datas</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <Label className="text-xs">Data de cadastro</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="date"
                  placeholder="De"
                  value={filters.created_after?.split('T')[0] || ''}
                  onChange={e => updateFilter('created_after', e.target.value ? `${e.target.value}T00:00:00-03:00` : undefined)}
                  className="h-8 text-xs"
                />
                <Input
                  type="date"
                  placeholder="Até"
                  value={filters.created_before?.split('T')[0] || ''}
                  onChange={e => updateFilter('created_before', e.target.value ? `${e.target.value}T23:59:59-03:00` : undefined)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Última interação</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="date"
                  placeholder="De"
                  value={filters.last_interaction_after?.split('T')[0] || ''}
                  onChange={e => updateFilter('last_interaction_after', e.target.value ? `${e.target.value}T00:00:00-03:00` : undefined)}
                  className="h-8 text-xs"
                />
                <Input
                  type="date"
                  placeholder="Até"
                  value={filters.last_interaction_before?.split('T')[0] || ''}
                  onChange={e => updateFilter('last_interaction_before', e.target.value ? `${e.target.value}T23:59:59-03:00` : undefined)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Localização</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <Label className="text-xs">Estado</Label>
              <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                {(states || []).map(s => (
                  <Badge
                    key={s}
                    variant={(filters.states || []).includes(s) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleArrayItem('states', s)}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Cidade</Label>
              <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                {(cities || []).slice(0, 50).map(c => (
                  <Badge
                    key={c}
                    variant={(filters.cities || []).includes(c) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleArrayItem('cities', c)}
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Score & Capital */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Score & Capital</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <Label className="text-xs">Score (0-100)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  placeholder="Min"
                  value={filters.score_min ?? ''}
                  onChange={e => updateFilter('score_min', e.target.value ? Number(e.target.value) : undefined)}
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={filters.score_max ?? ''}
                  onChange={e => updateFilter('score_max', e.target.value ? Number(e.target.value) : undefined)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Capital Disponível (R$)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  placeholder="Min"
                  value={filters.capital_min ?? ''}
                  onChange={e => updateFilter('capital_min', e.target.value ? Number(e.target.value) : undefined)}
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={filters.capital_max ?? ''}
                  onChange={e => updateFilter('capital_max', e.target.value ? Number(e.target.value) : undefined)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* UTM */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Origem (UTM)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <Label className="text-xs">UTM Source</Label>
              <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                {(utmSources || []).slice(0, 30).map(s => (
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
              <Label className="text-xs">UTM Campaign</Label>
              <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                {(utmCampaigns || []).slice(0, 30).map(c => (
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
          </CardContent>
        </Card>

        {/* Sales Rep & BANT */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Vendedor & Qualificação</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <Label className="text-xs">Vendedor Responsável</Label>
              <div className="space-y-1 mt-1 max-h-24 overflow-y-auto">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={filters.no_sales_rep || false}
                    onCheckedChange={(checked) => updateFilter('no_sales_rep', checked ? true : undefined)}
                  />
                  <span className="text-xs text-muted-foreground italic">Sem responsável</span>
                </label>
                {(teamMembers || []).map((m: any) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={(filters.sales_rep_ids || []).includes(m.id)}
                      onCheckedChange={() => toggleArrayItem('sales_rep_ids', m.id)}
                    />
                    <span className="text-xs">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">BANT</Label>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {(['bant_budget', 'bant_authority', 'bant_need', 'bant_timeline'] as const).map(key => (
                  <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={filters[key] || false}
                      onCheckedChange={(checked) => updateFilter(key, checked ? true : undefined)}
                    />
                    <span>{key.replace('bant_', '').charAt(0).toUpperCase() + key.replace('bant_', '').slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exclude recent campaigns */}
      <Card>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm whitespace-nowrap">Excluir leads que receberam campanha nos últimos</Label>
          <Input
            type="number"
            value={filters.exclude_campaign_days ?? ''}
            onChange={e => updateFilter('exclude_campaign_days', e.target.value ? Number(e.target.value) : undefined)}
            className="h-8 w-20 text-sm"
            placeholder="dias"
          />
          <span className="text-sm text-muted-foreground">dias</span>
        </CardContent>
      </Card>

      {/* Exclude specific leads */}
      <ExcludeLeadsSection
        excludeLeadIds={filters.exclude_lead_ids || []}
        onChange={(ids) => updateFilter('exclude_lead_ids', ids.length > 0 ? ids : undefined)}
      />
    </div>
  );
}
