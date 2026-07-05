import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Check } from 'lucide-react';
import { useCampaignTemplates } from '@/hooks/useCampaigns';
import type { CampaignTemplate } from '@/types/campaign.types';
import { cn } from '@/lib/utils';

interface TemplatePickerProps {
  selectedIds: Set<string>;
  onToggle: (template: CampaignTemplate) => void;
}

export default function TemplatePicker({ selectedIds, onToggle }: TemplatePickerProps) {
  const { data: templates = [], isLoading } = useCampaignTemplates();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando templates...</div>;
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Templates salvos
          </CardTitle>
          {selectedIds.size > 0 && (
            <Badge variant="default" className="text-xs">
              {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum template salvo. Crie mensagens customizadas abaixo.</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {templates.map(template => {
              const selected = selectedIds.has(template.id);
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onToggle(template)}
                  className={cn(
                    'flex items-start gap-2.5 p-2.5 rounded-md w-full text-left transition-all',
                    selected
                      ? 'bg-primary/10 border border-primary/30 ring-1 ring-primary/20'
                      : 'hover:bg-muted/50 border border-transparent'
                  )}
                >
                  <div className={cn(
                    'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-colors',
                    selected
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/30'
                  )}>
                    {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={cn('text-sm font-medium', selected && 'text-primary')}>{template.name}</span>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {template.content.slice(0, 140)}{template.content.length > 140 ? '...' : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
