import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { usePipelines, usePipelineStagesByPipeline } from '@/hooks/usePipelineConfig';
import { Search, Users, Filter, UserCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AudienceCriteria {
  pipeline_ids: string[];
  stage_ids: string[];
  lead_ids: string[];
}

interface Props {
  value: AudienceCriteria;
  onChange: (v: AudienceCriteria) => void;
  disabled?: boolean;
}

export function AudienceSelector({ value, onChange, disabled }: Props) {
  const [tab, setTab] = useState<'filter' | 'specific'>(value.lead_ids.length > 0 ? 'specific' : 'filter');
  const { data: pipelines = [] } = usePipelines();
  const [search, setSearch] = useState('');

  // Stages dos pipelines selecionados
  const { data: stagesData = [] } = useQuery({
    queryKey: ['stages-by-pipelines', value.pipeline_ids],
    queryFn: async () => {
      if (!value.pipeline_ids.length) return [];
      const { data, error } = await supabase
        .from('sales_pipeline_stages')
        .select('id, name, pipeline_id, position')
        .in('pipeline_id', value.pipeline_ids)
        .order('position');
      if (error) throw error;
      return data || [];
    },
  });

  // Busca leads pra modo específico
  const { data: leadsResults = [], isLoading: loadingLeads } = useQuery({
    queryKey: ['leads-search', search],
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('id, name, email, phone, sales_stage')
        .not('email', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: tab === 'specific',
  });

  // Conta destinatários estimados
  const audienceCount = useQuery({
    queryKey: ['audience-count', value],
    queryFn: async () => {
      let q = supabase.from('leads').select('id', { count: 'exact', head: true }).not('email', 'is', null);
      if (value.lead_ids.length) {
        q = q.in('id', value.lead_ids);
      } else if (value.stage_ids.length) {
        q = q.in('pipeline_stage_id', value.stage_ids);
      } else if (value.pipeline_ids.length) {
        const { data: stages } = await supabase
          .from('sales_pipeline_stages')
          .select('id')
          .in('pipeline_id', value.pipeline_ids);
        const ids = (stages || []).map((s: any) => s.id);
        if (ids.length) q = q.in('pipeline_stage_id', ids);
        else return 0;
      } else {
        return 0;
      }
      const { count } = await q;
      return count || 0;
    },
  });

  const togglePipeline = (id: string) => {
    const next = value.pipeline_ids.includes(id)
      ? value.pipeline_ids.filter((p) => p !== id)
      : [...value.pipeline_ids, id];
    // Reset stages quando muda pipelines
    onChange({ ...value, pipeline_ids: next, stage_ids: [], lead_ids: [] });
  };

  const toggleStage = (id: string) => {
    const next = value.stage_ids.includes(id)
      ? value.stage_ids.filter((s) => s !== id)
      : [...value.stage_ids, id];
    onChange({ ...value, stage_ids: next, lead_ids: [] });
  };

  const toggleLead = (id: string) => {
    const next = value.lead_ids.includes(id)
      ? value.lead_ids.filter((l) => l !== id)
      : [...value.lead_ids, id];
    onChange({ ...value, lead_ids: next, pipeline_ids: [], stage_ids: [] });
  };

  const selectedLeads = useMemo(
    () => leadsResults.filter((l) => value.lead_ids.includes(l.id)),
    [leadsResults, value.lead_ids],
  );

  const stagesByPipeline = useMemo(() => {
    const map = new Map<string, typeof stagesData>();
    for (const s of stagesData) {
      if (!map.has(s.pipeline_id)) map.set(s.pipeline_id, []);
      map.get(s.pipeline_id)!.push(s);
    }
    return map;
  }, [stagesData]);

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as any);
          if (v === 'specific') onChange({ pipeline_ids: [], stage_ids: [], lead_ids: value.lead_ids });
          else onChange({ ...value, lead_ids: [] });
        }}
      >
        <TabsList className="grid grid-cols-2 w-full max-w-sm">
          <TabsTrigger value="filter" className="gap-2">
            <Filter className="h-3.5 w-3.5" /> Por filtro
          </TabsTrigger>
          <TabsTrigger value="specific" className="gap-2">
            <UserCheck className="h-3.5 w-3.5" /> Leads específicos
          </TabsTrigger>
        </TabsList>

        {/* === Modo filtro === */}
        <TabsContent value="filter" className="space-y-4 mt-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
              Pipelines
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pipelines.map((p) => {
                const checked = value.pipeline_ids.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all',
                      checked && 'border-[#BAA05E] bg-[#BAA05E]/5',
                      !checked && 'hover:bg-muted/50',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => !disabled && togglePipeline(p.id)}
                      disabled={disabled}
                    />
                    <span className="text-sm font-medium flex-1">{p.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {value.pipeline_ids.length > 0 && stagesData.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Etapas (opcional)
                </Label>
                <span className="text-xs text-muted-foreground">
                  {value.stage_ids.length === 0 ? 'Todas' : `${value.stage_ids.length} selecionadas`}
                </span>
              </div>
              <ScrollArea className="max-h-72 pr-2">
                <div className="space-y-3">
                  {Array.from(stagesByPipeline.entries()).map(([pipelineId, stages]) => {
                    const pipeline = pipelines.find((p) => p.id === pipelineId);
                    return (
                      <div key={pipelineId}>
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                          {pipeline?.name}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {stages.map((s: any) => {
                            const checked = value.stage_ids.includes(s.id);
                            return (
                              <label
                                key={s.id}
                                className={cn(
                                  'flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm transition-all',
                                  checked && 'border-[#BAA05E] bg-[#BAA05E]/5',
                                  !checked && 'hover:bg-muted/50',
                                )}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => !disabled && toggleStage(s.id)}
                                  disabled={disabled}
                                />
                                <span className="flex-1 truncate">{s.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground mt-2">
                💡 Sem etapas selecionadas = todos os leads do pipeline
              </p>
            </div>
          )}
        </TabsContent>

        {/* === Modo leads específicos === */}
        <TabsContent value="specific" className="space-y-3 mt-4">
          {/* Selecionados */}
          {selectedLeads.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedLeads.map((l) => (
                <Badge
                  key={l.id}
                  variant="secondary"
                  className="gap-1 pr-1 bg-[#BAA05E]/10 text-foreground border border-[#BAA05E]/20"
                >
                  {l.name || l.email}
                  <button
                    onClick={() => !disabled && toggleLead(l.id)}
                    className="hover:bg-muted rounded-sm p-0.5"
                    disabled={disabled}
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar leads por nome ou email..."
              className="pl-9"
              disabled={disabled}
            />
          </div>

          <ScrollArea className="h-72 border rounded-lg">
            {loadingLeads ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Carregando...</div>
            ) : leadsResults.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                {search ? 'Nenhum lead encontrado' : 'Comece a buscar acima'}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {leadsResults.map((l) => {
                  const checked = value.lead_ids.includes(l.id);
                  return (
                    <label
                      key={l.id}
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all',
                        checked && 'bg-[#BAA05E]/5',
                        !checked && 'hover:bg-muted/50',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => !disabled && toggleLead(l.id)}
                        disabled={disabled}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{l.name || '(sem nome)'}</p>
                        <p className="text-xs text-muted-foreground truncate">{l.email}</p>
                      </div>
                      {l.sales_stage && (
                        <Badge variant="outline" className="text-[10px]">
                          {l.sales_stage}
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Contagem */}
      <Card className="bg-[#BAA05E]/5 border-[#BAA05E]/20">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#BAA05E]/15 flex items-center justify-center">
            <Users className="h-5 w-5 text-[#BAA05E]" />
          </div>
          <div>
            <p className="text-sm font-semibold tabular-nums">
              {audienceCount.isLoading ? '...' : (audienceCount.data ?? 0).toLocaleString('pt-BR')} destinatários
            </p>
            <p className="text-xs text-muted-foreground">
              {tab === 'specific' ? 'Leads selecionados manualmente' : 'Filtrados por pipeline/etapas'} · sem unsubscribers
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
