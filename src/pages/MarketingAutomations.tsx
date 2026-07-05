import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Zap, Plus, Loader2, BarChart3 } from 'lucide-react';
import {
  useEmailAutomations,
  useToggleEmailAutomation,
  type EmailAutomation,
} from '@/hooks/useEmailAutomations';
import AutomationReportSheet from '@/components/marketing/AutomationReportSheet';
import { AppLayout } from '@/components/layout/AppLayout';

// Rótulos legíveis pros triggers (mesmos valores usados no editor)
const TRIGGER_LABELS: Record<string, string> = {
  lead_created: 'Lead criado',
  lead_stage_changed: 'Lead mudou de etapa',
  deal_created: 'Negócio criado',
  deal_won: 'Negócio ganho',
  deal_lost: 'Negócio perdido',
};

export default function MarketingAutomations() {
  const navigate = useNavigate();
  const { data: automations, isLoading } = useEmailAutomations();
  const toggle = useToggleEmailAutomation();

  const [report, setReport] = useState<EmailAutomation | null>(null);

  return (
    <AppLayout>
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Automações de Marketing</h1>
            <p className="text-sm text-muted-foreground">
              Fluxos que disparam sozinhos quando algo acontece no CRM
            </p>
          </div>
        </div>
        <Button onClick={() => navigate('/marketing/automacoes/nova')}>
          <Plus className="h-4 w-4 mr-2" />
          Nova
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : automations && automations.length > 0 ? (
        <div className="space-y-2">
          {automations.map((a) => (
            <div
              key={a.id}
              onClick={() => navigate(`/marketing/automacoes/${a.id}`)}
              className="group flex items-center gap-4 p-4 rounded-lg border hover:bg-accent/30 cursor-pointer transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{a.name}</p>
                  <Badge variant={a.is_active ? 'default' : 'secondary'} className="text-[10px]">
                    {a.is_active ? 'Ativa' : 'Pausada'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {a.trigger_event
                    ? TRIGGER_LABELS[a.trigger_event] || a.trigger_event
                    : 'Sem gatilho definido'}
                  {a.description ? ` · ${a.description}` : ''}
                </p>
              </div>

              {/* Relatório */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  setReport(a);
                }}
                title="Relatório"
              >
                <BarChart3 className="h-4 w-4 mr-1.5" />
                Relatório
              </Button>

              {/* Liga/desliga */}
              <div onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={a.is_active}
                  disabled={toggle.isPending}
                  onCheckedChange={(checked) => toggle.mutate({ id: a.id, is_active: checked })}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <Zap className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <h3 className="mt-4 text-lg font-medium">Nenhuma automação ainda</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Crie fluxos que reagem sozinhos a eventos como leads e negócios.
          </p>
          <Button className="mt-4" onClick={() => navigate('/marketing/automacoes/nova')}>
            <Plus className="h-4 w-4 mr-2" />
            Nova automação
          </Button>
        </div>
      )}

      {/* Relatório de uma automação */}
      {report && (
        <AutomationReportSheet
          open={!!report}
          onOpenChange={(open) => !open && setReport(null)}
          automationId={report.id}
          automationName={report.name}
        />
      )}
    </div>
    </AppLayout>
  );
}
