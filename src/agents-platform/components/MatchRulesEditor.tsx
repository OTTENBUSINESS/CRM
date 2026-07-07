/**
 * MatchRulesEditor — define QUANDO esse deployment atende.
 *
 * Aplicado dentro do DeploymentCard (TabCanais). Edita:
 *  - config.priority (int, menor = avalia primeiro)
 *  - config.match.ad_source        (string exata)
 *  - config.match.lead_is_new      (true | false | null=ignora)
 *  - config.match.pipeline_id      (uuid do funil)
 *  - config.match.stage_id         (uuid da etapa)
 *  - config.match.from_webinar     (boolean)
 *  - config.match.custom_jsonpath  (avançado — string livre)
 *
 * Filosofia: AND lógico — só atende se TODAS condições preenchidas baterem.
 * Campo vazio (null/undefined) = ignora aquela condição.
 */

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Target } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  config: Record<string, any>;
  setField: (k: string, v: any) => void;
}

type Pipeline = { id: string; name: string };
type Stage = { id: string; name: string; pipeline_id: string; position: number };

export function MatchRulesEditor({ config, setField }: Props) {
  const [open, setOpen] = useState(() => !!config.match && Object.keys(config.match).length > 0);

  const match: Record<string, any> = config.match || {};
  const priority: number = typeof config.priority === 'number' ? config.priority : 100;

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines-list'],
    queryFn: async (): Promise<Pipeline[]> => {
      const { data } = await supabase.from('sales_pipelines').select('id, name').order('name');
      return (data as Pipeline[]) || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages', match.pipeline_id],
    queryFn: async (): Promise<Stage[]> => {
      if (!match.pipeline_id) return [];
      const { data } = await supabase
        .from('sales_pipeline_stages')
        .select('id, name, pipeline_id, position')
        .eq('pipeline_id', match.pipeline_id)
        .order('position');
      return (data as Stage[]) || [];
    },
    enabled: !!match.pipeline_id,
    staleTime: 5 * 60_000,
  });

  const setMatchField = (k: string, v: any) => {
    const newMatch = { ...match };
    if (v === '' || v === null || v === undefined) {
      delete newMatch[k];
    } else {
      newMatch[k] = v;
    }
    setField('match', Object.keys(newMatch).length > 0 ? newMatch : undefined);
  };

  const activeCount = Object.keys(match).filter((k) => match[k] !== null && match[k] !== '').length;

  return (
    <div className="mt-3 pt-3 border-t border-border/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-medium text-foreground/80 hover:text-foreground w-full"
      >
        <Target className="h-3.5 w-3.5 text-primary" />
        <span>Regras de roteamento</span>
        {activeCount > 0 && (
          <Badge variant="outline" className="h-4 text-[9px] border-primary/40 text-primary">
            {activeCount} ativa{activeCount > 1 ? 's' : ''}
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          prioridade: <span className="font-mono">{priority}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-muted-foreground italic">
            AND lógico. Campo vazio = ignora aquela condição. Vazio em tudo = atende qualquer caso.
          </p>

          {/* Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Prioridade</Label>
              <Input
                type="number"
                min={1} max={999}
                value={priority}
                onChange={(e) => setField('priority', Number(e.target.value) || 100)}
                className="mt-1 h-8 text-xs"
              />
              <p className="text-[9px] text-muted-foreground mt-0.5">menor = avalia primeiro</p>
            </div>

            <div>
              <Label className="text-[11px]">Lead novo?</Label>
              <select
                value={match.lead_is_new === true ? 'true' : match.lead_is_new === false ? 'false' : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setMatchField('lead_is_new', v === 'true' ? true : v === 'false' ? false : null);
                }}
                className="mt-1 w-full h-8 border border-input bg-background rounded-md px-2 text-xs"
              >
                <option value="">(qualquer)</option>
                <option value="true">Só leads NOVOS</option>
                <option value="false">Só leads JÁ EXISTENTES</option>
              </select>
            </div>
          </div>

          {/* Match: ad_source */}
          <div>
            <Label className="text-[11px]">Origem do anúncio (ad_source)</Label>
            <Input
              value={match.ad_source || ''}
              onChange={(e) => setMatchField('ad_source', e.target.value.trim() || null)}
              placeholder="ex: ctwa_demo, ctwa_palestra (deixa vazio = qualquer)"
              className="mt-1 h-8 text-xs font-mono"
            />
          </div>

          {/* Match: pipeline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Funil</Label>
              <select
                value={match.pipeline_id || ''}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setMatchField('pipeline_id', v);
                  if (!v) setMatchField('stage_id', null);
                }}
                className="mt-1 w-full h-8 border border-input bg-background rounded-md px-2 text-xs"
              >
                <option value="">(qualquer funil)</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-[11px]">Etapa</Label>
              <select
                value={match.stage_id || ''}
                onChange={(e) => setMatchField('stage_id', e.target.value || null)}
                disabled={!match.pipeline_id}
                className="mt-1 w-full h-8 border border-input bg-background rounded-md px-2 text-xs disabled:opacity-50"
              >
                <option value="">(qualquer etapa)</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.position + 1}. {s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Match: from_webinar */}
          <div>
            <Label className="text-[11px] flex items-center gap-2">
              <input
                type="checkbox"
                checked={match.from_webinar === true}
                onChange={(e) => setMatchField('from_webinar', e.target.checked ? true : null)}
                className="h-3.5 w-3.5"
              />
              Veio de webinário
            </Label>
          </div>

          {/* Avançado: custom JSON path */}
          <details>
            <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
              Avançado: condição custom (JSONPath)
            </summary>
            <div className="mt-2">
              <Input
                value={match.custom_jsonpath || ''}
                onChange={(e) => setMatchField('custom_jsonpath', e.target.value.trim() || null)}
                placeholder='$.lead.metadata.utm_source == "google"'
                className="h-8 text-xs font-mono"
              />
              <p className="text-[9px] text-muted-foreground mt-1">
                JSONPath avaliado contra o contexto da msg. Use só se precisar.
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
