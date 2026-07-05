import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, FileText, AlertCircle, CheckCircle2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWhatsAppTemplates } from '@/hooks/useWhatsAppTemplates';
import type { CloudTemplateParam } from '@/types/campaign.types';

const LEAD_FIELDS: Array<{ value: string; label: string; example: string }> = [
  { value: 'nome',           label: 'Nome completo',     example: 'João da Silva' },
  { value: 'primeiro_nome',  label: 'Primeiro nome',     example: 'João' },
  { value: 'email',          label: 'Email',             example: 'joao@empresa.com' },
  { value: 'telefone',       label: 'Telefone',          example: '+5511999999999' },
  { value: 'cidade',         label: 'Cidade',            example: 'São Paulo' },
  { value: 'estado',         label: 'Estado',            example: 'SP' },
  { value: 'empresa',        label: 'Empresa',           example: 'ACME Ltda' },
];

interface Props {
  selectedTemplateId: string | null;
  params: CloudTemplateParam[];
  onChange: (templateId: string | null, params: CloudTemplateParam[]) => void;
}

export default function CloudTemplatePicker({ selectedTemplateId, params, onChange }: Props) {
  const { data: templates = [], isLoading } = useWhatsAppTemplates();
  const [search, setSearch] = useState('');

  const approved = useMemo(
    () => templates.filter((t: any) => (t.status || '').toUpperCase() === 'APPROVED'),
    [templates],
  );

  const filtered = useMemo(
    () =>
      approved.filter((t: any) =>
        !search.trim()
          ? true
          : t.name.toLowerCase().includes(search.trim().toLowerCase()) ||
            (t.components || []).some((c: any) =>
              (c.text || '').toLowerCase().includes(search.trim().toLowerCase()),
            ),
      ),
    [approved, search],
  );

  const selectedTemplate = useMemo(
    () => templates.find((t: any) => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  const variableCount = selectedTemplate?.variables_count || 0;

  const updateParam = (index: number, updates: Partial<CloudTemplateParam>) => {
    const existing = params.find((p) => p.index === index);
    let next: CloudTemplateParam[];
    if (existing) {
      next = params.map((p) => (p.index === index ? { ...p, ...updates } : p));
    } else {
      next = [...params, { index, type: 'lead_field', value: 'primeiro_nome', ...updates }];
    }
    onChange(selectedTemplateId, next);
  };

  const handleSelect = (template: any) => {
    // Inicializa params com defaults baseados na quantidade de variáveis
    const newParams: CloudTemplateParam[] = [];
    const varCount = template.variables_count || 0;
    for (let i = 1; i <= varCount; i++) {
      newParams.push({
        index: i,
        type: 'lead_field',
        value: i === 1 ? 'primeiro_nome' : 'nome',
      });
    }
    onChange(template.id, newParams);
  };

  return (
    <div className="space-y-4">
      {/* Lista de templates */}
      {!selectedTemplateId && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar template…"
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Badge variant="outline" className="text-[10px]">
              {filtered.length} de {approved.length} aprovados
            </Badge>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Carregando templates…</div>
          ) : approved.length === 0 ? (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="p-6 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Nenhum template aprovado</p>
                  <p className="text-xs text-muted-foreground">
                    Sincronize com a Meta em <strong>Marketing → Templates WhatsApp</strong> ou crie um novo template na Meta Business Suite.
                    A campanha por API Oficial só envia templates com status <strong>APPROVED</strong>.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
              {filtered.map((t: any) => (
                <Card
                  key={t.id}
                  className="cursor-pointer hover:border-[#BAA05E]/50 transition-all"
                  onClick={() => handleSelect(t)}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {t.category} · {t.language}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700 border-emerald-200">
                        <CheckCircle2 className="h-2.5 w-2.5" /> APPROVED
                      </Badge>
                    </div>
                    <TemplatePreview template={t} compact />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Template selecionado + mapeamento de variáveis */}
      {selectedTemplateId && selectedTemplate && (
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-emerald-50 to-transparent border-emerald-200">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <FileText className="h-3.5 w-3.5 text-emerald-700" />
                    <p className="text-[10px] uppercase tracking-[0.18em] font-medium text-emerald-700">
                      Template selecionado
                    </p>
                  </div>
                  <h3 className="text-base font-semibold">{selectedTemplate.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedTemplate.category} · {selectedTemplate.language} · {variableCount} {variableCount === 1 ? 'variável' : 'variáveis'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onChange(null, [])}>
                  Trocar
                </Button>
              </div>
              <TemplatePreview template={selectedTemplate} />
            </CardContent>
          </Card>

          {variableCount > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <Label className="text-sm font-medium">Preencher variáveis</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cada variável vira parte da mensagem. Escolha entre texto fixo ou um campo do lead.
                  </p>
                </div>

                <div className="space-y-2">
                  {Array.from({ length: variableCount }, (_, i) => i + 1).map((idx) => {
                    const param = params.find((p) => p.index === idx) || {
                      index: idx,
                      type: 'lead_field' as const,
                      value: 'primeiro_nome',
                    };
                    return (
                      <div key={idx} className="flex items-start gap-2 p-2.5 rounded-md border bg-muted/20">
                        <Badge variant="outline" className="font-mono text-[10px] mt-1.5">
                          {`{{${idx}}}`}
                        </Badge>
                        <div className="flex-1 grid grid-cols-2 gap-1.5">
                          <Select
                            value={param.type}
                            onValueChange={(v) => updateParam(idx, { type: v as 'static' | 'lead_field', value: v === 'lead_field' ? 'primeiro_nome' : '' })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lead_field">Campo do lead</SelectItem>
                              <SelectItem value="static">Texto fixo</SelectItem>
                            </SelectContent>
                          </Select>

                          {param.type === 'lead_field' ? (
                            <Select
                              value={param.value}
                              onValueChange={(v) => updateParam(idx, { value: v })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LEAD_FIELDS.map((f) => (
                                  <SelectItem key={f.value} value={f.value}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={param.value}
                              onChange={(e) => updateParam(idx, { value: e.target.value })}
                              placeholder="Texto..."
                              className="h-8 text-xs"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Eye className="h-2.5 w-2.5" />
                  Exemplo de preenchimento:{' '}
                  {params
                    .sort((a, b) => a.index - b.index)
                    .map((p) =>
                      p.type === 'lead_field'
                        ? LEAD_FIELDS.find((f) => f.value === p.value)?.example || '...'
                        : p.value || '...',
                    )
                    .join(' · ') || '—'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function TemplatePreview({ template, compact }: { template: any; compact?: boolean }) {
  const components = template.components || [];
  const body = components.find((c: any) => c.type === 'BODY');
  const header = components.find((c: any) => c.type === 'HEADER');
  const footer = components.find((c: any) => c.type === 'FOOTER');

  const bodyText = body?.text || '';

  if (compact) {
    return (
      <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">
        {bodyText}
      </p>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-3 space-y-2 text-sm" style={{ fontFamily: '-apple-system, system-ui, sans-serif' }}>
      {header?.text && <p className="font-semibold">{header.text}</p>}
      {bodyText && <p className="whitespace-pre-wrap leading-relaxed">{bodyText}</p>}
      {footer?.text && <p className="text-xs text-muted-foreground italic">{footer.text}</p>}
    </div>
  );
}
