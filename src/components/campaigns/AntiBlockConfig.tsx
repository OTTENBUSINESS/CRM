import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface AntiBlockConfigProps {
  config: any;
  onChange: (config: any) => void;
}

const FIELDS = [
  {
    key: 'delay_min_seconds',
    label: 'Delay minimo entre mensagens (segundos)',
    type: 'number',
  },
  {
    key: 'delay_max_seconds',
    label: 'Delay maximo entre mensagens (segundos)',
    type: 'number',
  },
  {
    key: 'batch_size',
    label: 'Tamanho do lote (mensagens por lote)',
    type: 'number',
  },
  {
    key: 'batch_pause_min_seconds',
    label: 'Pausa minima entre lotes (segundos)',
    type: 'number',
  },
  {
    key: 'batch_pause_max_seconds',
    label: 'Pausa maxima entre lotes (segundos)',
    type: 'number',
  },
  {
    key: 'hourly_limit_per_instance',
    label: 'Limite por hora por instancia',
    type: 'number',
  },
  {
    key: 'daily_limit_per_instance',
    label: 'Limite diario por instancia',
    type: 'number',
  },
] as const;

export default function AntiBlockConfig({ config, onChange }: AntiBlockConfigProps) {
  const [open, setOpen] = useState(false);

  const handleFieldChange = (key: string, rawValue: string) => {
    const numericValue = rawValue === '' ? 0 : Number(rawValue);
    onChange({ ...config, [key]: numericValue });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
        />
        Configuracoes avancadas
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key} className="text-xs">
                {field.label}
              </Label>
              <Input
                id={field.key}
                type="number"
                min={0}
                value={config[field.key] ?? ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
