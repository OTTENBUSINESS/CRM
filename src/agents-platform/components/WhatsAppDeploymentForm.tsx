/**
 * WhatsAppDeploymentForm — formulário do deployment WhatsApp do agente.
 *
 * Substitui o ConfigFields(whatsapp) + MatchRulesEditor pra esse canal.
 * Layout organizado por FINALIDADE (interno vs atende leads), em vez de
 * jogar todos os campos de uma vez.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Smartphone, Users, MessageSquare, Lock, Briefcase, X, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  config: Record<string, any>;
  setField: (k: string, v: any) => void;
}

type Instance = { id: string; name: string; phone_number: string | null; status: string | null };
type Pipeline = { id: string; name: string };
type Stage = { id: string; name: string; pipeline_id: string; position: number };

type Purpose = 'internal' | 'leads';

/** Deriva a finalidade do config existente (pra deployments antigos). */
function derivePurpose(config: Record<string, any>): Purpose {
  if (config.purpose === 'internal' || config.purpose === 'leads') return config.purpose;
  if (config.access_mode === 'private' || (Array.isArray(config.authorized_numbers) && config.authorized_numbers.length)) {
    return 'internal';
  }
  return 'leads';
}

export function WhatsAppDeploymentForm({ config, setField }: Props) {
  const purpose: Purpose = derivePurpose(config);
  const match: Record<string, any> = config.match || {};
  const priority: number = typeof config.priority === 'number' ? config.priority : 100;

  // Instâncias WhatsApp do sistema
  const { data: instances = [] } = useQuery({
    queryKey: ['wa-instances-for-deployment'],
    queryFn: async (): Promise<Instance[]> => {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('id, name, phone_number, status')
        .order('status', { ascending: false })  // connected primeiro
        .order('name');
      return (data as Instance[]) || [];
    },
    staleTime: 60_000,
  });

  const setMatchField = (k: string, v: any) => {
    const newMatch = { ...match };
    if (v === '' || v === null || v === undefined) delete newMatch[k];
    else newMatch[k] = v;
    setField('match', Object.keys(newMatch).length > 0 ? newMatch : undefined);
  };

  const setPurpose = (p: Purpose) => {
    setField('purpose', p);
    if (p === 'internal') {
      // ao virar interno, força access_mode privado por segurança
      setField('access_mode', 'private');
      // limpa filtros de lead (deixa só keywords se tiver)
      const cleaned: Record<string, any> = {};
      if (match.keywords) cleaned.keywords = match.keywords;
      if (match.keywords_mode) cleaned.keywords_mode = match.keywords_mode;
      setField('match', Object.keys(cleaned).length > 0 ? cleaned : undefined);
    } else {
      // ao virar atende leads, libera (mas mantém whitelist caso queira)
      setField('access_mode', config.access_mode || 'open');
    }
  };

  return (
    <div className="space-y-5">
      {/* ─── INSTÂNCIA ─── */}
      <div>
        <Label className="text-xs flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5 text-primary" />
          Número WhatsApp (instância)
        </Label>
        <select
          value={config.instance_id || ''}
          onChange={(e) => setField('instance_id', e.target.value || null)}
          className="mt-1.5 w-full h-9 border border-input bg-background rounded-md px-2 text-sm"
        >
          <option value="">— Selecione um número —</option>
          {instances.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}{i.phone_number ? ` (+${i.phone_number})` : ''}{i.status !== 'connected' ? ` · ${i.status || 'desconectado'}` : ''}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">
          Conecte um número novo em <span className="font-mono">/meu-whatsapp</span> se não estiver na lista.
        </p>
      </div>

      {/* ─── FINALIDADE ─── */}
      <div>
        <Label className="text-xs">Pra que esse agente vai atender nesse número?</Label>
        <div className="mt-2 grid sm:grid-cols-2 gap-2">
          <PurposeOption
            selected={purpose === 'internal'}
            onClick={() => setPurpose('internal')}
            icon={<Lock className="h-4 w-4" />}
            title="Uso interno"
            desc="Só quem você autorizar conversa com ele. Bom pra assistente pessoal, gestão, dados."
          />
          <PurposeOption
            selected={purpose === 'leads'}
            onClick={() => setPurpose('leads')}
            icon={<Briefcase className="h-4 w-4" />}
            title="Atende leads"
            desc="Qualquer pessoa que mandar msg fala com ele. Bom pra SDR, qualificação, atendimento."
          />
        </div>
      </div>

      {/* ─── BLOCO CONDICIONAL ─── */}
      {purpose === 'internal' ? (
        <InternalSection config={config} setField={setField} />
      ) : (
        <LeadsSection
          match={match}
          setMatchField={setMatchField}
        />
      )}

      {/* ─── FILTROS OPCIONAIS (ambos) ─── */}
      <div className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/20">
        <div className="text-[11px] font-medium text-muted-foreground">
          Filtros opcionais (vazio = atende em qualquer caso)
        </div>

        <KeywordsField
          value={match.keywords || []}
          mode={match.keywords_mode || 'any'}
          onChange={(kws) => setMatchField('keywords', kws.length > 0 ? kws : null)}
          onChangeMode={(m) => setMatchField('keywords_mode', m === 'any' ? null : m)}
        />

        <div>
          <Label className="text-[11px]">Prioridade</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number" min={1} max={999}
              value={priority}
              onChange={(e) => setField('priority', Number(e.target.value) || 100)}
              className="h-8 text-xs w-24"
            />
            <span className="text-[10px] text-muted-foreground">menor = avalia primeiro (útil se tiver mais de um agente no mesmo número)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PurposeOption({ selected, onClick, icon, title, desc }: {
  selected: boolean; onClick: () => void;
  icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left p-3 rounded-lg border transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-border/80 hover:bg-muted/40'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={cn('rounded-full p-1', selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
          {icon}
        </span>
        <span className="text-sm font-medium">{title}</span>
        {selected && <Badge className="ml-auto h-4 text-[9px] bg-primary text-white border-0">ativo</Badge>}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
    </button>
  );
}

/** Seção quando é Uso interno: whitelist de números + msg pra não autorizado. */
function InternalSection({ config, setField }: { config: Record<string, any>; setField: (k: string, v: any) => void }) {
  const [newNumber, setNewNumber] = useState('');
  const authorized: string[] = Array.isArray(config.authorized_numbers) ? config.authorized_numbers : [];

  const addNumber = () => {
    const digits = newNumber.replace(/\D/g, '');
    if (!digits) return;
    if (authorized.includes(digits)) { setNewNumber(''); return; }
    setField('authorized_numbers', [...authorized, digits]);
    setNewNumber('');
  };

  const removeNumber = (n: string) => {
    setField('authorized_numbers', authorized.filter((x) => x !== n));
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-medium">Quem pode falar com esse agente</span>
      </div>

      <div>
        <Label className="text-[11px]">Números autorizados</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNumber(); } }}
            placeholder="55 31 99999-9999"
            className="h-8 text-xs"
          />
          <Button size="sm" variant="outline" onClick={addNumber} className="h-8 text-xs gap-1">
            <Plus className="h-3 w-3" /> Adicionar
          </Button>
        </div>
        {authorized.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {authorized.map((n) => (
              <Badge key={n} variant="outline" className="gap-1 text-[11px] font-mono pr-1">
                +{n}
                <button onClick={() => removeNumber(n)} className="hover:text-red-500" aria-label="remover">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-amber-600 mt-1.5">
            ⚠️ Sem números autorizados, ninguém vai conseguir conversar com esse agente.
          </p>
        )}
      </div>

      <div>
        <Label className="text-[11px] flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" />
          Resposta pra quem NÃO está autorizado (opcional)
        </Label>
        <Input
          value={config.unauthorized_message || ''}
          onChange={(e) => setField('unauthorized_message', e.target.value || null)}
          placeholder="Ex: Esse atendimento é privado. Vou te encaminhar pra equipe."
          className="mt-1 h-8 text-xs"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Se vazio, o agente apenas ignora msgs de números não autorizados.
        </p>
      </div>
    </div>
  );
}

/** Seção quando atende leads: filtros de funil/anúncio/etc. */
function LeadsSection({ match, setMatchField }: {
  match: Record<string, any>;
  setMatchField: (k: string, v: any) => void;
}) {
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
        .eq('pipeline_id', match.pipeline_id).order('position');
      return (data as Stage[]) || [];
    },
    enabled: !!match.pipeline_id,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Briefcase className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-medium">Quais leads esse agente atende</span>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Vazio em tudo = atende QUALQUER lead que mandar msg nesse número. Use os filtros pra direcionar (ex: só leads de um anúncio específico).
      </p>

      <div className="grid grid-cols-2 gap-3">
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
        <div>
          <Label className="text-[11px]">Origem do anúncio (ad_source)</Label>
          <Input
            value={match.ad_source || ''}
            onChange={(e) => setMatchField('ad_source', e.target.value.trim() || null)}
            placeholder="ex: ctwa_demo"
            className="mt-1 h-8 text-xs font-mono"
          />
        </div>
      </div>

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
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            {stages.map((s) => <option key={s.id} value={s.id}>{s.position + 1}. {s.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

/** Lista de palavras-chave (chips). Vazio = atende qualquer mensagem. */
function KeywordsField({ value, mode, onChange, onChangeMode }: {
  value: string[]; mode: 'any' | 'all';
  onChange: (v: string[]) => void;
  onChangeMode: (m: 'any' | 'all') => void;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const w = input.trim().toLowerCase();
    if (!w) return;
    if (value.includes(w)) { setInput(''); return; }
    onChange([...value, w]);
    setInput('');
  };
  return (
    <div>
      <Label className="text-[11px]">
        Palavras-chave (só responde se a msg contiver)
      </Label>
      <div className="flex gap-2 mt-1">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="ex: relatório, vendas, faturamento"
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" onClick={add} className="h-8 text-xs gap-1">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {value.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {value.map((kw) => (
              <Badge key={kw} variant="outline" className="gap-1 text-[11px] pr-1">
                {kw}
                <button onClick={() => onChange(value.filter((x) => x !== kw))} className="hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px]">
            <span className="text-muted-foreground">Modo:</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={mode === 'any'} onChange={() => onChangeMode('any')} className="h-3 w-3" />
              <span>Qualquer uma</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={mode === 'all'} onChange={() => onChangeMode('all')} className="h-3 w-3" />
              <span>Todas juntas</span>
            </label>
          </div>
        </>
      )}
      <p className="text-[10px] text-muted-foreground mt-1">
        Útil pra ter vários agentes no mesmo número (cada um responde por tema).
      </p>
    </div>
  );
}
