import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Rocket,
  Clock,
  Users,
  MessageSquare,
  Send,
  UserCheck,
  Radio,
  ClipboardCheck,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type {
  AudienceFilters,
  AssignmentMode,
  CampaignProvider,
  CloudTemplateParam,
} from '@/types/campaign.types';
import { ASSIGNMENT_MODE_LABELS } from '@/types/campaign.types';
import {
  useCreateCampaign,
  useStartCampaign,
  useScheduleCampaign,
  useAudienceCount,
  useAudienceSample,
} from '@/hooks/useCampaigns';
import ChannelPicker from '@/components/campaigns/ChannelPicker';
import AudiencePicker from '@/components/campaigns/AudiencePicker';
import CloudTemplatePicker from '@/components/campaigns/CloudTemplatePicker';
import TemplateEditor from '@/components/campaigns/TemplateEditor';
import AssignmentRuleConfig from '@/components/campaigns/AssignmentRuleConfig';
import InstanceSelector from '@/components/campaigns/InstanceSelector';
import AntiBlockConfig from '@/components/campaigns/AntiBlockConfig';

// ─────────────────────────────────────────────────────────────────────────────
// Wizard de 7 passos pra criar campanha de WhatsApp (multi-canal), em pagina
// inteira. Espelha o shell do SalesTraining e reaproveita a logica de
// buildPayload/create/start do CampaignForm (dialog uazapi), adaptando pra
// cloud_api (template Meta) via cloud_template_id/cloud_template_params.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'identidade', label: 'Identidade', icon: MessageSquare },
  { id: 'canal', label: 'Canal', icon: Radio },
  { id: 'audiencia', label: 'Audiência', icon: Users },
  { id: 'mensagem', label: 'Mensagem', icon: Send },
  { id: 'responde', label: 'Quem responde', icon: UserCheck },
  { id: 'envio', label: 'Envio', icon: Clock },
  { id: 'revisao', label: 'Revisão', icon: ClipboardCheck },
] as const;

const DEFAULT_ANTI_BLOCK = {
  delay_min_seconds: 45,
  delay_max_seconds: 90,
  batch_size: 20,
  batch_pause_min_seconds: 180,
  batch_pause_max_seconds: 300,
  hourly_limit_per_instance: 40,
  daily_limit_per_instance: 500,
};

export default function SalesCampaignNew() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Estado do formulario ──────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<CampaignProvider>('cloud_api');
  const [filters, setFilters] = useState<AudienceFilters>({});

  // Mensagem — cloud_api (template Meta)
  const [cloudTemplateId, setCloudTemplateId] = useState<string | null>(null);
  const [cloudParams, setCloudParams] = useState<CloudTemplateParam[]>([]);
  // Mensagem — uazapi (texto livre)
  const [messageContent, setMessageContent] = useState('');

  // Atribuicao
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('keep_current');
  const [assignmentTargetId, setAssignmentTargetId] = useState<string | null>(null);
  const [distributionConfigId, setDistributionConfigId] = useState<string | null>(null);

  // Envio
  const [instanceIds, setInstanceIds] = useState<string[]>([]);
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [businessHoursStart, setBusinessHoursStart] = useState('08:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState('20:00');
  const [antiBlockConfig, setAntiBlockConfig] = useState({ ...DEFAULT_ANTI_BLOCK });

  const createCampaign = useCreateCampaign();
  const startCampaign = useStartCampaign();
  const scheduleCampaign = useScheduleCampaign();
  const { data: audienceCount } = useAudienceCount(filters);
  const { data: sampleLeads } = useAudienceSample(filters);

  const isCloud = provider === 'cloud_api';

  // ── Validacao por passo ─────────────────────────────────────────────────────
  const canAdvance = (s: number): boolean => {
    switch (s) {
      case 0: // Identidade
        return name.trim().length > 0;
      case 1: // Canal
        return provider === 'cloud_api' || provider === 'uazapi';
      case 2: // Audiencia
        return (audienceCount || 0) > 0;
      case 3: // Mensagem
        return isCloud ? !!cloudTemplateId : messageContent.trim().length > 0;
      case 4: // Quem responde
        return true;
      case 5: // Envio
        return instanceIds.length > 0 && (sendNow || !!scheduledAt);
      case 6: // Revisao
        return true;
      default:
        return false;
    }
  };

  const canFinish = STEPS.every((_, i) => canAdvance(i));

  // ── Payload — segue o formato do CampaignForm, com campos multi-canal ────────
  const buildPayload = () => {
    return {
      name: name.trim(),
      description: description.trim() || null,
      provider,
      audience_filters: filters,
      instance_ids: instanceIds,
      assignment_mode: assignmentMode,
      assignment_target_id: assignmentTargetId,
      assignment_distribution_config_id: distributionConfigId,
      business_hours_start: businessHoursStart,
      business_hours_end: businessHoursEnd,
      // Mensagem depende do canal
      ...(isCloud
        ? {
            cloud_template_id: cloudTemplateId,
            cloud_template_params: cloudParams,
            message_content: '',
            message_contents: [],
            template_id: null,
          }
        : {
            cloud_template_id: null,
            cloud_template_params: [],
            message_content: messageContent.trim(),
            message_contents: [messageContent.trim()],
            template_id: null,
          }),
      // Anti-block so faz sentido no uazapi; no cloud_api mantemos os defaults
      ...antiBlockConfig,
    } as Record<string, any>;
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const campaign = await createCampaign.mutateAsync(buildPayload());

      if (sendNow) {
        await startCampaign.mutateAsync(campaign.id);
        toast({
          title: 'Campanha iniciada!',
          description: `Disparando para ${(audienceCount || 0).toLocaleString('pt-BR')} lead(s).`,
        });
      } else if (scheduledAt) {
        await scheduleCampaign.mutateAsync({ campaignId: campaign.id, scheduledAt });
        toast({
          title: 'Campanha agendada!',
          description: `Será enviada em ${new Date(scheduledAt).toLocaleString('pt-BR')}.`,
        });
      } else {
        toast({ title: 'Campanha salva como rascunho.' });
      }

      setConfirmOpen(false);
      navigate('/comercial/inbox');
    } catch (error: any) {
      toast({
        title: 'Erro ao criar campanha',
        description: error?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <Send className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Nova Campanha WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              Configure o disparo em massa passo a passo
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Stepper lateral */}
        <aside className="space-y-1">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const active = idx === step;
            const done = idx < step;
            const reachable = idx <= step;
            return (
              <button
                key={s.id}
                onClick={() => reachable && setStep(idx)}
                disabled={!reachable}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'text-primary hover:bg-primary/10'
                      : 'text-muted-foreground hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center h-6 w-6 rounded-full text-xs shrink-0 border',
                    active
                      ? 'bg-primary-foreground/20 border-transparent'
                      : done
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'border-border',
                  )}
                >
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                </span>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Conteudo do passo */}
        <div className="min-h-[420px]">
          {/* 01 — Identidade */}
          {step === 0 && (
            <div className="space-y-4 max-w-xl">
              <div>
                <Label>Nome da campanha *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Reativação Fev/26"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o objetivo da campanha..."
                  className="mt-1"
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* 02 — Canal */}
          {step === 1 && (
            <ChannelPicker value={provider} onChange={setProvider} />
          )}

          {/* 03 — Audiencia */}
          {step === 2 && (
            <AudiencePicker
              filters={filters}
              onChange={setFilters}
              channelHint={provider}
            />
          )}

          {/* 04 — Mensagem */}
          {step === 3 && (
            <div className="space-y-4">
              {isCloud ? (
                <CloudTemplatePicker
                  selectedTemplateId={cloudTemplateId}
                  params={cloudParams}
                  onChange={(templateId, params) => {
                    setCloudTemplateId(templateId);
                    setCloudParams(params);
                  }}
                />
              ) : (
                <TemplateEditor
                  value={messageContent}
                  onChange={setMessageContent}
                  sampleLeads={sampleLeads || []}
                />
              )}
            </div>
          )}

          {/* 05 — Quem responde */}
          {step === 4 && (
            <div className="space-y-4 max-w-2xl">
              <p className="text-sm text-muted-foreground">
                Configure quem recebe os leads que responderem à campanha.
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

          {/* 06 — Envio */}
          {step === 5 && (
            <div className="space-y-4 max-w-2xl">
              <InstanceSelector value={instanceIds} onChange={setInstanceIds} />

              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium">Horário comercial</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <div>
                      <Label className="text-xs">Início</Label>
                      <Input
                        type="time"
                        value={businessHoursStart}
                        onChange={(e) => setBusinessHoursStart(e.target.value)}
                        className="h-8 w-28"
                      />
                    </div>
                    <span className="text-muted-foreground mt-5">—</span>
                    <div>
                      <Label className="text-xs">Fim</Label>
                      <Input
                        type="time"
                        value={businessHoursEnd}
                        onChange={(e) => setBusinessHoursEnd(e.target.value)}
                        className="h-8 w-28"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium">Quando enviar</CardTitle>
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
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-64"
                    />
                  )}
                </CardContent>
              </Card>

              {/* Anti-block so no uazapi */}
              {provider === 'uazapi' && (
                <AntiBlockConfig config={antiBlockConfig} onChange={setAntiBlockConfig} />
              )}
            </div>
          )}

          {/* 07 — Revisao */}
          {step === 6 && (
            <ReviewStep
              name={name}
              description={description}
              provider={provider}
              audienceCount={audienceCount || 0}
              isCloud={isCloud}
              cloudTemplateId={cloudTemplateId}
              cloudParamsCount={cloudParams.length}
              messageContent={messageContent}
              assignmentMode={assignmentMode}
              instanceCount={instanceIds.length}
              sendNow={sendNow}
              scheduledAt={scheduledAt}
            />
          )}

          {/* Footer de navegacao */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t">
            <Button
              variant="ghost"
              onClick={() => (step > 0 ? goBack() : navigate(-1))}
              disabled={isSubmitting}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {step > 0 ? 'Voltar' : 'Cancelar'}
            </Button>

            {!isLastStep ? (
              <Button onClick={goNext} disabled={!canAdvance(step)}>
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!canFinish || isSubmitting}
              >
                <Rocket className="h-4 w-4 mr-1" />
                {sendNow ? 'Criar e disparar' : scheduledAt ? 'Criar e agendar' : 'Criar campanha'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmacao — nao pode desfazer */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar disparo da campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              {sendNow ? (
                <>
                  Esta ação vai disparar a campanha <strong>{name}</strong> para{' '}
                  <strong>{(audienceCount || 0).toLocaleString('pt-BR')}</strong> lead(s) agora.
                  {' '}Depois de iniciada, <strong>não é possível desfazer</strong> os envios já
                  realizados.
                </>
              ) : (
                <>
                  A campanha <strong>{name}</strong> será agendada para{' '}
                  <strong>
                    {scheduledAt ? new Date(scheduledAt).toLocaleString('pt-BR') : '—'}
                  </strong>
                  . Você poderá acompanhar o progresso depois.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Rocket className="h-4 w-4 mr-2" />
              )}
              {sendNow ? 'Sim, disparar agora' : 'Sim, agendar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Passo de revisao — resumo compacto do que foi configurado
// ─────────────────────────────────────────────────────────────────────────────

interface ReviewStepProps {
  name: string;
  description: string;
  provider: CampaignProvider;
  audienceCount: number;
  isCloud: boolean;
  cloudTemplateId: string | null;
  cloudParamsCount: number;
  messageContent: string;
  assignmentMode: AssignmentMode;
  instanceCount: number;
  sendNow: boolean;
  scheduledAt: string;
}

function ReviewStep({
  name,
  description,
  provider,
  audienceCount,
  isCloud,
  cloudTemplateId,
  cloudParamsCount,
  messageContent,
  assignmentMode,
  instanceCount,
  sendNow,
  scheduledAt,
}: ReviewStepProps) {
  const rows = useMemo(
    () => [
      { label: 'Nome', value: name || '—' },
      { label: 'Descrição', value: description || '—' },
      {
        label: 'Canal',
        value: provider === 'cloud_api' ? 'API Oficial (Meta)' : 'API Não Oficial (UAZAPI)',
      },
      { label: 'Audiência', value: `${audienceCount.toLocaleString('pt-BR')} lead(s)` },
      {
        label: 'Mensagem',
        value: isCloud
          ? cloudTemplateId
            ? `Template Meta · ${cloudParamsCount} variável(is)`
            : 'Template não selecionado'
          : messageContent.trim()
            ? `${messageContent.trim().slice(0, 60)}${messageContent.trim().length > 60 ? '…' : ''}`
            : 'Sem mensagem',
      },
      { label: 'Quem responde', value: ASSIGNMENT_MODE_LABELS[assignmentMode] },
      { label: 'Instâncias', value: `${instanceCount} selecionada(s)` },
      {
        label: 'Envio',
        value: sendNow
          ? 'Agora'
          : scheduledAt
            ? new Date(scheduledAt).toLocaleString('pt-BR')
            : 'Não definido',
      },
    ],
    [
      name,
      description,
      provider,
      audienceCount,
      isCloud,
      cloudTemplateId,
      cloudParamsCount,
      messageContent,
      assignmentMode,
      instanceCount,
      sendNow,
      scheduledAt,
    ],
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Revisão final</h2>
        <p className="text-sm text-muted-foreground">
          Confira tudo antes de disparar. Ao confirmar, os envios não podem ser desfeitos.
        </p>
      </div>

      <Card>
        <CardContent className="p-0 divide-y">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-4 px-4 py-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium shrink-0">
                {r.label}
              </span>
              <span className="text-sm text-right">{r.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Badge variant="outline" className="text-[11px] gap-1">
        {sendNow ? 'Disparo imediato após confirmar' : 'Agendamento após confirmar'}
      </Badge>
    </div>
  );
}
