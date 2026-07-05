import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useWhatsAppInstances } from '@/hooks/useCampaigns';
import { Loader2 } from 'lucide-react';

interface InstanceSelectorProps {
  value: string[];
  onChange: (ids: string[]) => void;
}

const STATUS_DOT_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  disconnected: 'bg-red-500',
  connecting: 'bg-yellow-500',
};

export default function InstanceSelector({ value, onChange }: InstanceSelectorProps) {
  const { data: instances = [], isLoading } = useWhatsAppInstances();

  const allSelected = instances.length > 0 && value.length === instances.length;

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      onChange(instances.map((i: any) => i.id));
    } else {
      onChange([]);
    }
  };

  const handleToggle = (instanceId: string, checked: boolean) => {
    if (checked) {
      onChange([...value, instanceId]);
    } else {
      onChange(value.filter((id) => id !== instanceId));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Instancias WhatsApp</CardTitle>
          {instances.length > 1 && (
            <div className="flex items-center gap-2">
              <Switch
                id="select-all-instances"
                checked={allSelected}
                onCheckedChange={handleToggleAll}
              />
              <Label htmlFor="select-all-instances" className="text-xs text-muted-foreground cursor-pointer">
                Usar todas
              </Label>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : instances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma instancia de campanha encontrada. Crie uma na aba "Instancias".
          </p>
        ) : (
          instances.map((instance: any) => (
            <label
              key={instance.id}
              className="flex items-center gap-3 cursor-pointer rounded-md border p-3 hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                checked={value.includes(instance.id)}
                onCheckedChange={(checked) => handleToggle(instance.id, !!checked)}
              />
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full shrink-0',
                  STATUS_DOT_COLORS[instance.status] ?? 'bg-gray-400',
                )}
              />
              <span className="text-sm font-medium">{instance.name}</span>
            </label>
          ))
        )}
      </CardContent>
    </Card>
  );
}
