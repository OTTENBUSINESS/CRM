import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePipelineStages, useDistinctCities, useDistinctStates, useDistinctUtmSources } from '@/hooks/useCampaigns';
import type { EmailAudienceFilters } from '@/types/email.types';

interface Props {
  filters: EmailAudienceFilters;
  onChange: (filters: EmailAudienceFilters) => void;
}

export default function EmailAudienceBuilder({ filters, onChange }: Props) {
  const { data: stages } = usePipelineStages();
  const { data: cities } = useDistinctCities();
  const { data: states } = useDistinctStates();
  const { data: utmSources } = useDistinctUtmSources();

  const update = (key: keyof EmailAudienceFilters, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Apenas leads com email preenchido e que nao pediram descadastro serao incluidos.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Etapa do Pipeline</Label>
          <Select
            value={filters.pipeline_stage_ids?.[0] || 'all'}
            onValueChange={v => update('pipeline_stage_ids', v === 'all' ? [] : [v])}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas</SelectItem>
              {(stages || []).map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.sales_pipelines?.name} → {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Estado</Label>
          <Select
            value={filters.states?.[0] || 'all'}
            onValueChange={v => update('states', v === 'all' ? [] : [v])}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(states || []).map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Cidade</Label>
          <Select
            value={filters.cities?.[0] || 'all'}
            onValueChange={v => update('cities', v === 'all' ? [] : [v])}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(cities || []).map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Fonte UTM</Label>
          <Select
            value={filters.utm_sources?.[0] || 'all'}
            onValueChange={v => update('utm_sources', v === 'all' ? [] : [v])}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(utmSources || []).map(u => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Score Minimo</Label>
          <Input
            type="number"
            className="h-8"
            placeholder="0"
            value={filters.score_min || ''}
            onChange={e => update('score_min', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>

        <div>
          <Label className="text-xs">Score Maximo</Label>
          <Input
            type="number"
            className="h-8"
            placeholder="100"
            value={filters.score_max || ''}
            onChange={e => update('score_max', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>

        <div>
          <Label className="text-xs">Excluir quem recebeu email nos ultimos X dias</Label>
          <Input
            type="number"
            className="h-8"
            placeholder="7"
            value={filters.exclude_campaign_days || ''}
            onChange={e => update('exclude_campaign_days', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
      </div>
    </div>
  );
}
