import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AssignmentMode } from '@/types/campaign.types';
import { ASSIGNMENT_MODE_LABELS } from '@/types/campaign.types';
import { useAllTeamMembers } from '@/hooks/useTeamMembers';
import { useMemo } from 'react';

interface AssignmentRuleConfigProps {
  mode: AssignmentMode;
  targetId: string | null;
  distributionConfigId: string | null;
  onModeChange: (mode: AssignmentMode) => void;
  onTargetChange: (id: string | null) => void;
  onDistributionConfigChange: (id: string | null) => void;
}

const ALL_MODES = Object.keys(ASSIGNMENT_MODE_LABELS) as AssignmentMode[];

export default function AssignmentRuleConfig({
  mode,
  targetId,
  onModeChange,
  onTargetChange,
}: AssignmentRuleConfigProps) {
  const { data: members = [] } = useAllTeamMembers();

  const requiresTarget = mode === 'specific_sdr' || mode === 'specific_closer';

  const filteredMembers = useMemo(() => {
    if (!requiresTarget) return [];
    const subRole = mode === 'specific_sdr' ? 'sdr' : 'closer';
    return members.filter((m) => m.is_active && m.sub_role === subRole);
  }, [members, mode, requiresTarget]);

  const handleModeChange = (newMode: string) => {
    onModeChange(newMode as AssignmentMode);
    onTargetChange(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Atribuicao ao responder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="assignment-mode">Modo de atribuicao</Label>
          <Select value={mode} onValueChange={handleModeChange}>
            <SelectTrigger id="assignment-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {ASSIGNMENT_MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {requiresTarget && (
          <div className="space-y-1.5">
            <Label htmlFor="assignment-target">
              {mode === 'specific_sdr' ? 'SDR responsavel' : 'Closer responsavel'}
            </Label>
            <Select
              value={targetId ?? ''}
              onValueChange={(val) => onTargetChange(val || null)}
            >
              <SelectTrigger id="assignment-target">
                <SelectValue placeholder="Selecione um membro" />
              </SelectTrigger>
              <SelectContent>
                {filteredMembers.length === 0 ? (
                  <SelectItem value="_empty" disabled>
                    Nenhum membro com esse papel encontrado
                  </SelectItem>
                ) : (
                  filteredMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
