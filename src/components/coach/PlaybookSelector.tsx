import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  BookOpen,
  Headphones,
  GraduationCap,
  MessageSquare,
  Settings2,
  Mic,
  Lightbulb,
  Star,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCoachPlaybooks } from '@/hooks/useCoachPlaybooks';
import { playbookTypeLabels, type CoachPlaybook, type PlaybookType } from '@/types/coach.types';

interface PlaybookSelectorProps {
  onSelect: (playbook: CoachPlaybook | null) => void;
  onCancel: () => void;
  defaultType?: PlaybookType;
}

const typeIcons: Record<PlaybookType, React.ReactNode> = {
  sales: <BookOpen className="h-5 w-5" />,
  cs: <Headphones className="h-5 w-5" />,
  onboarding: <GraduationCap className="h-5 w-5" />,
  support: <MessageSquare className="h-5 w-5" />,
  custom: <Settings2 className="h-5 w-5" />,
};

const typeColors: Record<PlaybookType, string> = {
  sales: 'border-blue-500/30 bg-blue-500/5',
  cs: 'border-green-500/30 bg-green-500/5',
  onboarding: 'border-purple-500/30 bg-purple-500/5',
  support: 'border-orange-500/30 bg-orange-500/5',
  custom: 'border-gray-500/30 bg-gray-500/5',
};

export function PlaybookSelector({ onSelect, onCancel, defaultType = 'sales' }: PlaybookSelectorProps) {
  const [selectedId, setSelectedId] = useState<string | 'none'>('none');
  const { data: playbooks, isLoading } = useCoachPlaybooks();

  // Find default playbook and set it as selected on load
  const defaultPlaybook = playbooks?.find((p) => p.is_default && p.type === defaultType);

  useEffect(() => {
    if (defaultPlaybook && selectedId === 'none') {
      setSelectedId(defaultPlaybook.id);
    }
  }, [defaultPlaybook]);

  const handleStart = () => {
    if (selectedId === 'none') {
      onSelect(null);
    } else {
      const playbook = playbooks?.find((p) => p.id === selectedId);
      onSelect(playbook || null);
    }
  };

  const selectedPlaybook = selectedId !== 'none' ? playbooks?.find((p) => p.id === selectedId) : null;

  return (
    <Card className="w-[450px] shadow-xl bg-white dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Iniciar Sales Coach
        </CardTitle>
        <CardDescription>
          Escolha um playbook para receber assistência em tempo real ou inicie apenas com transcrição
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <RadioGroup value={selectedId} onValueChange={setSelectedId}>
              <ScrollArea className="h-[250px] pr-4">
                <div className="space-y-2">
                  {/* Option: No playbook */}
                  <div
                    className={cn(
                      'flex items-start space-x-3 rounded-lg border p-3 cursor-pointer transition-colors',
                      selectedId === 'none'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    )}
                    onClick={() => setSelectedId('none')}
                  >
                    <RadioGroupItem value="none" id="none" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="none" className="flex items-center gap-2 cursor-pointer font-medium">
                        <Mic className="h-4 w-4" />
                        Apenas Transcrição
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Inicie sem assistência de IA. A transcrição será salva automaticamente.
                      </p>
                    </div>
                  </div>

                  {/* Playbooks */}
                  {playbooks?.map((playbook) => (
                    <div
                      key={playbook.id}
                      className={cn(
                        'flex items-start space-x-3 rounded-lg border p-3 cursor-pointer transition-colors',
                        selectedId === playbook.id
                          ? 'border-primary bg-primary/5'
                          : cn('border-border hover:border-muted-foreground/30', typeColors[playbook.type])
                      )}
                      onClick={() => setSelectedId(playbook.id)}
                    >
                      <RadioGroupItem value={playbook.id} id={playbook.id} className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor={playbook.id} className="flex items-center gap-2 cursor-pointer font-medium">
                          {typeIcons[playbook.type]}
                          {playbook.name}
                          {playbook.is_default && (
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          )}
                        </Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {playbookTypeLabels[playbook.type]}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {playbook.phases.length} fases
                          </Badge>
                        </div>
                        {playbook.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {playbook.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </RadioGroup>

            {/* Selected playbook preview */}
            {selectedPlaybook && (
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Fases do playbook:</p>
                <div className="flex flex-wrap gap-1">
                  {selectedPlaybook.phases.map((phase, index) => (
                    <Badge key={phase.id} variant="outline" className="text-xs gap-1">
                      <span className="text-muted-foreground">{index + 1}.</span>
                      {phase.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleStart} className="flex-1 gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Iniciar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
