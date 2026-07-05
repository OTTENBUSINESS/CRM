import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Rocket, Clock, Users, MessageSquare, Send, UserCheck, Plus, X, Copy, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { AudienceFilters, AssignmentMode, CampaignTemplate } from '@/types/campaign.types';
import {
  useCreateCampaign,
  useStartCampaign,
  useScheduleCampaign,
  useAudienceCount,
  useAudienceSample,
  useCampaignTemplates,
} from '@/hooks/useCampaigns';
import AudienceBuilder from './AudienceBuilder';
import TemplateEditor from './TemplateEditor';
import TemplatePicker from './TemplatePicker';
import InstanceSelector from './InstanceSelector';
import AntiBlockConfig from './AntiBlockConfig';
import AssignmentRuleConfig from './AssignmentRuleConfig';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const STEPS = [
  { label: 'Basico', icon: MessageSquare },
  { label: 'Audiencia', icon: Users },
  { label: 'Mensagem', icon: Send },
  { label: 'Envio', icon: Clock },
  { label: 'Atribuicao', icon: UserCheck },
];

const MAX_VARIATIONS = 5;

export default function CampaignForm({ open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [filters, setFilters] = useState<AudienceFilters>({});
  const [messageContents, setMessageContents] = useState<string[]>(['']);
  const [activeVariation, setActiveVariation] = useState(0);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [instanceIds, setInstanceIds] = useState<string[]>([]);
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [businessHoursStart, setBusinessHoursStart] = useState('08:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState('20:00');
  const [antiBlockConfig, setAntiBlockConfig] = useState({
    delay_min_seconds: 45,
    delay_max_seconds: 90,
    batch_size: 20,
    batch_pause_min_seconds: 180,
    batch_pause_max_seconds: 300,
    hourly_limit_per_instance: 40,
    daily_limit_per_instance: 500,
  });
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('keep_current');
  const [assignmentTargetId, setAssignmentTargetId] = useState<string | null>(null);
  const [distributionConfigId, setDistributionConfigId] = useState<string | null>(null);

  const createCampaign = useCreateCampaign();
  const startCampaign = useStartCampaign();
  const scheduleCampaign = useScheduleCampaign();
  const { data: audienceCount } = useAudienceCount(filters);
  const { data: sampleLeads } = useAudienceSample(filters);

  const handleToggleTemplate = (template: CampaignTemplate) => {
    const next = new Set(selectedTemplateIds);
    if (next.has(template.id)) {
      // Deselect — remove content from variations
      next.delete(template.id);
      const idx = messageContents.indexOf(template.content);
      if (idx >= 0) {
        const newContents = messageContents.filter((_, i) => i !== idx);
        setMessageContents(newContents.length > 0 ? newContents : ['']);
        if (activeVariation >= (newContents.length || 1)) {
          setActiveVariation(Math.max(0, (newContents.length || 1) - 1));
        }
      }
    } else {
      // Select — add content to variations
      next.add(template.id);
      const newContents = [...messageContents];
      const emptyIdx = newContents.findIndex(c => c.trim() === '');
      if (emptyIdx >= 0) {
        newContents[emptyIdx] = template.content;
      } else if (newContents.length < MAX_VARIATIONS) {
        newContents.push(template.content);
      } else {
        // Max reached — don't add
        return;
      }
      setMessageContents(newContents);
      setActiveVariation(emptyIdx >= 0 ? emptyIdx : newContents.length - 1);
    }
    setSelectedTemplateIds(next);
  };

  const updateVariation = (index: number, value: string) => {
    const next = [...messageContents];
    next[index] = value;
    setMessageContents(next);
  };

  const addVariation = () => {
    if (messageContents.length >= MAX_VARIATIONS) return;
    setMessageContents([...messageContents, '']);
    setActiveVariation(messageContents.length);
  };

  const duplicateVariation = (index: number) => {
    if (messageContents.length >= MAX_VARIATIONS) return;
    const next = [...messageContents];
    next.splice(index + 1, 0, messageContents[index]);
    setMessageContents(next);
    setActiveVariation(index + 1);
  };

  const removeVariation = (index: number) => {
    if (messageContents.length <= 1) return;
    const next = messageContents.filter((_, i) => i !== index);
    setMessageContents(next);
    if (activeVariation >= next.length) {
      setActiveVariation(next.length - 1);
    }
  };

  const canNext = () => {
    switch (step) {
      case 0: return name.trim().length > 0;
      case 1: return (audienceCount || 0) > 0;
      case 2: return messageContents.some(m => m.trim().length > 0);
      case 3: return instanceIds.length > 0;
      case 4: return true;
      default: return false;
    }
  };

  const buildCampaignPayload = () => {
    const validContents = messageContents.filter(m => m.trim().length > 0);
    return {
      name,
      description: description || null,
      message_content: validContents[0] || '', // backward compat
      message_contents: validContents,
      audience_filters: filters,
      instance_ids: instanceIds,
      template_id: null,
      assignment_mode: assignmentMode,
      assignment_target_id: assignmentTargetId,
      assignment_distribution_config_id: distributionConfigId,
      business_hours_start: businessHoursStart,
      business_hours_end: businessHoursEnd,
      ...antiBlockConfig,
    } as any;
  };

  const handleSaveDraft = async () => {
    if (!name.trim()) {
      toast({ title: 'De um nome para a campanha', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      await createCampaign.mutateAsync(buildCampaignPayload());
      toast({ title: 'Rascunho salvo!', description: 'Voce pode editar e disparar depois.' });
      onOpenChange(false);
      onSuccess?.();
      resetForm();
    } catch (error: any) {
      toast({ title: 'Erro ao salvar rascunho', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const campaign = await createCampaign.mutateAsync(buildCampaignPayload());
      const validContents = messageContents.filter(m => m.trim().length > 0);

      if (sendNow) {
        await startCampaign.mutateAsync(campaign.id);
        toast({ title: 'Campanha iniciada!', description: `Enviando para ${audienceCount} leads com ${validContents.length} variacao(oes).` });
      } else if (scheduledAt) {
        await scheduleCampaign.mutateAsync({ campaignId: campaign.id, scheduledAt });
        toast({ title: 'Campanha agendada!', description: `Sera enviada em ${new Date(scheduledAt).toLocaleString('pt-BR')}.` });
      } else {
        toast({ title: 'Campanha salva como rascunho.' });
      }

      onOpenChange(false);
      onSuccess?.();
      resetForm();
    } catch (error: any) {
      toast({ title: 'Erro ao criar campanha', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(0);
    setName('');
    setDescription('');
    setFilters({});
    setMessageContents(['']);
    setActiveVariation(0);
    setSelectedTemplateIds(new Set());
    setInstanceIds([]);
    setSendNow(true);
    setScheduledAt('');
    setAssignmentMode('keep_current');
    setAssignmentTargetId(null);
  };

  // Estimate send time
  const estimateTime = () => {
    if (!audienceCount || instanceIds.length === 0) return null;
    const avgDelay = (antiBlockConfig.delay_min_seconds + antiBlockConfig.delay_max_seconds) / 2;
    const batchPause = (antiBlockConfig.batch_pause_min_seconds + antiBlockConfig.batch_pause_max_seconds) / 2;
    const batches = Math.ceil(audienceCount / antiBlockConfig.batch_size);
    const totalSeconds = audienceCount * avgDelay / instanceIds.length + (batches - 1) * batchPause;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.ceil((totalSeconds % 3600) / 60);
    if (hours > 0) return `~${hours}h${minutes > 0 ? `${minutes}min` : ''}`;
    return `~${minutes}min`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Nova Campanha WhatsApp</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-2">
          {STEPS.map((s, idx) => (
            <div key={idx} className="flex items-center flex-1">
              <button
                onClick={() => idx <= step && setStep(idx)}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors w-full',
                  idx === step
                    ? 'bg-primary text-primary-foreground'
                    : idx < step
                    ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{idx + 1}</span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={cn('h-0.5 w-4 mx-0.5', idx < step ? 'bg-primary' : 'bg-muted')} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="mt-4 min-h-[300px]">
          {/* Step 1: Basic */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>Nome da Campanha *</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Reativacao Fev/26"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Descricao</Label>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Descreva o objetivo da campanha..."
                  className="mt-1"
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Step 2: Audience */}
          {step === 1 && (
            <AudienceBuilder filters={filters} onChange={setFilters} />
          )}

          {/* Step 3: Message — Multi-template */}
          {step === 2 && (
            <div className="space-y-4">
              <TemplatePicker
                selectedIds={selectedTemplateIds}
                onToggle={handleToggleTemplate}
              />

              {/* Variation tabs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Variacoes de mensagem</Label>
                    <Badge variant="secondary" className="text-xs">
                      {messageContents.length}/{MAX_VARIATIONS}
                    </Badge>
                  </div>
                  {messageContents.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Mensagens alternam automaticamente (round-robin)
                    </p>
                  )}
                </div>

                {/* Tabs row */}
                <div className="flex items-center gap-1 flex-wrap">
                  {messageContents.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveVariation(idx)}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                        idx === activeVariation
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      Msg {idx + 1}
                      {messageContents[idx].trim() === '' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      )}
                    </button>
                  ))}
                  {messageContents.length < MAX_VARIATIONS && (
                    <button
                      onClick={addVariation}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted/80 border border-dashed"
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar
                    </button>
                  )}
                </div>

                {/* Active variation editor */}
                <div className="relative">
                  {messageContents.length > 1 && (
                    <div className="flex items-center gap-1 absolute top-0 right-0 z-10">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => duplicateVariation(activeVariation)}
                        disabled={messageContents.length >= MAX_VARIATIONS}
                        title="Duplicar variacao"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => removeVariation(activeVariation)}
                        disabled={messageContents.length <= 1}
                        title="Remover variacao"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <TemplateEditor
                    value={messageContents[activeVariation] || ''}
                    onChange={(val) => updateVariation(activeVariation, val)}
                    sampleLeads={sampleLeads || []}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Send Settings */}
          {step === 3 && (
            <div className="space-y-4">
              <InstanceSelector value={instanceIds} onChange={setInstanceIds} />

              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium">Horario Comercial</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <div>
                      <Label className="text-xs">Inicio</Label>
                      <Input
                        type="time"
                        value={businessHoursStart}
                        onChange={e => setBusinessHoursStart(e.target.value)}
                        className="h-8 w-28"
                      />
                    </div>
                    <span className="text-muted-foreground mt-5">—</span>
                    <div>
                      <Label className="text-xs">Fim</Label>
                      <Input
                        type="time"
                        value={businessHoursEnd}
                        onChange={e => setBusinessHoursEnd(e.target.value)}
                        className="h-8 w-28"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium">Agendamento</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="flex gap-2">
                    <Button
                      variant={sendNow ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSendNow(true)}
                    >
                      <Rocket className="h-3.5 w-3.5 mr-1" />
                      Enviar agora
                    </Button>
                    <Button
                      variant={!sendNow ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSendNow(false)}
                    >
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      Agendar
                    </Button>
                  </div>
                  {!sendNow && (
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                      className="w-64"
                    />
                  )}
                </CardContent>
              </Card>

              <AntiBlockConfig config={antiBlockConfig} onChange={setAntiBlockConfig} />

              {/* Estimate */}
              {audienceCount && instanceIds.length > 0 && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
                  <strong>{audienceCount.toLocaleString('pt-BR')}</strong> leads
                  {' · '}<strong>{instanceIds.length}</strong> instancia{instanceIds.length > 1 ? 's' : ''}
                  {messageContents.filter(m => m.trim()).length > 1 && (
                    <>{' · '}<strong>{messageContents.filter(m => m.trim()).length}</strong> variacoes</>
                  )}
                  {estimateTime() && <>{' · '}<strong>{estimateTime()}</strong> para completar</>}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Assignment */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Configure quem recebe os leads que responderem a campanha.
              </p>
              <AssignmentRuleConfig
                mode={assignmentMode}
                targetId={assignmentTargetId}
                distributionConfigId={distributionConfigId}
                onModeChange={setAssignmentMode}
                onTargetChange={setAssignmentTargetId}
                onDistributionConfigChange={setDistributionConfigId}
              />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={() => step > 0 ? setStep(step - 1) : onOpenChange(false)}
            disabled={isSubmitting}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step > 0 ? 'Voltar' : 'Cancelar'}
          </Button>

          <div className="flex items-center gap-2">
            {/* Salvar Rascunho — disponivel a partir do step 0 se tiver nome */}
            {name.trim().length > 0 && (
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Salvar Rascunho
              </Button>
            )}

            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
                Proximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isSubmitting || !canNext()}>
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                ) : (
                  <Rocket className="h-4 w-4 mr-1" />
                )}
                {sendNow ? 'Criar e Enviar' : scheduledAt ? 'Criar e Agendar' : 'Salvar Rascunho'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
