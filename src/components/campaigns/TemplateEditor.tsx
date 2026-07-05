import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Variable, Eye } from 'lucide-react';
import { CAMPAIGN_VARIABLES } from '@/types/campaign.types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  sampleLeads?: any[];
}

export default function TemplateEditor({ value, onChange, sampleLeads = [] }: Props) {
  const [showPreview, setShowPreview] = useState(false);

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById('campaign-template-editor') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = value.slice(0, start) + variable + value.slice(end);
      onChange(newValue);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      onChange(value + variable);
    }
  };

  const resolvePreview = (template: string, lead: any): string => {
    let msg = template;
    const firstName = (lead?.name || '').split(' ')[0];
    msg = msg.replace(/\{\{nome\}\}/g, lead?.name || 'Nome');
    msg = msg.replace(/\{\{primeiro_nome\}\}/g, firstName || 'Nome');
    msg = msg.replace(/\{\{email\}\}/g, lead?.email || 'email@exemplo.com');
    msg = msg.replace(/\{\{telefone\}\}/g, lead?.phone || '5531999999999');
    msg = msg.replace(/\{\{cidade\}\}/g, lead?.city_name || 'Cidade');
    msg = msg.replace(/\{\{estado\}\}/g, lead?.state || 'UF');
    msg = msg.replace(/\{\{empresa\}\}/g, lead?.company_name || 'Empresa');
    msg = msg.replace(/\{\{vendedor\}\}/g, 'Vendedor');
    return msg;
  };

  return (
    <div className="space-y-4">
      {/* Variables buttons */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Variable className="h-4 w-4" />
            Variáveis disponíveis
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-wrap gap-1.5">
            {CAMPAIGN_VARIABLES.map(v => (
              <Button
                key={v.key}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => insertVariable(v.key)}
              >
                {v.key}
                <span className="text-muted-foreground ml-1">({v.label})</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Mensagem</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{value.length} caracteres</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              {showPreview ? 'Esconder Preview' : 'Preview'}
            </Button>
          </div>
        </div>
        <Textarea
          id="campaign-template-editor"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Oi {{primeiro_nome}}, tudo bem? Aqui é da Sua Empresabão..."
          className="min-h-[160px] font-mono text-sm"
        />
      </div>

      {/* Preview */}
      {showPreview && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Preview com leads reais</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {sampleLeads.length > 0 ? (
              sampleLeads.map((lead, idx) => (
                <div key={lead.id || idx} className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] h-5">
                      {lead.name || 'Lead'}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{lead.phone}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{resolvePreview(value, lead)}</p>
                </div>
              ))
            ) : (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm whitespace-pre-wrap">
                  {resolvePreview(value, { name: 'João Silva', email: 'joao@email.com', phone: '5531999999999', city_name: 'Belo Horizonte', state: 'MG', company_name: 'Empresa X' })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
