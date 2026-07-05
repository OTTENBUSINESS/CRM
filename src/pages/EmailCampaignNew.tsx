import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Send,
  Clock,
  Users,
  Eye,
  Beaker,
  Check,
  Mail,
} from 'lucide-react';
import {
  useCreateEmailCampaign,
  useUpdateEmailCampaign,
  useStartEmailCampaign,
  useScheduleEmailCampaign,
  useSendEmailCampaignTest,
  useEmailAudienceCount,
  useBrevoSettings,
} from '@/hooks/useEmailMarketing';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { EmailAudienceFilters, EmailTemplate } from '@/types/email.types';
import EmailAudiencePicker from '@/components/email-marketing/EmailAudiencePicker';
import EmailTemplateGallery from '@/components/email-marketing/EmailTemplateGallery';
import EmailPreviewModal from '@/components/email-marketing/EmailPreviewModal';
import { cn } from '@/lib/utils';

// Passos do wizard de página inteira. Cada passo tem número, título e descrição
// curta que aparece no stepper lateral.
const STEPS = [
  { n: '01', title: 'Identidade', desc: 'Nome e descrição' },
  { n: '02', title: 'Remetente', desc: 'De quem vem o email' },
  { n: '03', title: 'Audiência', desc: 'Quem vai receber' },
  { n: '04', title: 'Conteúdo', desc: 'Assunto e template' },
  { n: '05', title: 'Envio', desc: 'Agora ou agendar' },
  { n: '06', title: 'Revisão', desc: 'Conferir e disparar' },
];

export default function EmailCampaignNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: brevoSettings } = useBrevoSettings();

  const createCampaign = useCreateEmailCampaign();
  const updateCampaign = useUpdateEmailCampaign();
  const startCampaign = useStartEmailCampaign();
  const scheduleCampaign = useScheduleEmailCampaign();
  const sendTest = useSendEmailCampaignTest();

  const [step, setStep] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  // Estado do formulário
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [filters, setFilters] = useState<EmailAudienceFilters>({});
  const [subject, setSubject] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [testEmail, setTestEmail] = useState(user?.email || '');
  const [campaignId, setCampaignId] = useState<string | null>(null);
  // Guarda de quais settings o remetente já foi auto-preenchido, pra não
  // sobrescrever o que o usuário digitou.
  const [senderPrefilled, setSenderPrefilled] = useState(false);

  const { data: audienceCount } = useEmailAudienceCount(filters);

  // Auto-preenche remetente a partir das configs do Brevo (uma vez só).
  useMemo(() => {
    if (!senderPrefilled && brevoSettings) {
      if (brevoSettings.sender_name) setFromName(prev => prev || brevoSettings.sender_name);
      if (brevoSettings.sender_email) setFromEmail(prev => prev || brevoSettings.sender_email);
      setSenderPrefilled(true);
    }
  }, [brevoSettings, senderPrefilled]);

  const isSaving = createCampaign.isPending || updateCampaign.isPending;

  const canNext = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return true; // remetente cai no fallback das settings se vazio
    if (step === 2) return (audienceCount || 0) > 0;
    if (step === 3) return subject.trim().length > 0 && !!selectedTemplate;
    if (step === 4) return sendMode === 'now' || (sendMode === 'schedule' && !!scheduledAt);
    return true;
  };

  // Garante que existe um rascunho salvo (cria na 1ª vez, atualiza depois).
  const persistDraft = async () => {
    const payload = {
      name,
      description: description || null,
      subject,
      from_name: fromName || brevoSettings?.sender_name || '',
      from_email: fromEmail || brevoSettings?.sender_email || '',
      reply_to: replyTo || null,
      audience_filters: filters as any,
      ...(selectedTemplate
        ? { template_id: selectedTemplate.id, html_content: selectedTemplate.html_content }
        : {}),
    };

    if (campaignId) {
      await updateCampaign.mutateAsync({ id: campaignId, ...payload });
      return campaignId;
    }
    const created = await createCampaign.mutateAsync(payload);
    setCampaignId(created.id);
    return created.id;
  };

  const handleNext = async () => {
    // A partir do passo de Conteúdo já temos dados suficientes pra salvar o
    // rascunho e conseguir mandar teste no passo de Envio.
    if (step >= 3) {
      try {
        await persistDraft();
      } catch {
        toast({ title: 'Erro ao salvar rascunho', variant: 'destructive' });
        return;
      }
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    if (step === 0) {
      navigate('/marketing/campanhas');
      return;
    }
    setStep(s => s - 1);
  };

  const handleSendTest = async () => {
    if (!selectedTemplate) {
      toast({ title: 'Selecione um template antes de enviar teste', variant: 'destructive' });
      return;
    }
    if (!testEmail.trim() || !testEmail.includes('@')) {
      toast({ title: 'Informe um email válido', variant: 'destructive' });
      return;
    }
    try {
      const id = await persistDraft();
      await sendTest.mutateAsync({
        campaignId: id,
        testEmail: testEmail.trim(),
        html: selectedTemplate.html_content,
      });
      toast({ title: `Teste enviado para ${testEmail.trim()}` });
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao enviar teste', variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    try {
      const id = await persistDraft();
      if (sendMode === 'schedule') {
        if (!scheduledAt) {
          toast({ title: 'Escolha data e hora do agendamento', variant: 'destructive' });
          return;
        }
        await scheduleCampaign.mutateAsync({ campaignId: id, scheduledAt });
        toast({ title: 'Campanha agendada!' });
      } else {
        await startCampaign.mutateAsync(id);
        toast({ title: 'Campanha iniciada!' });
      }
      navigate('/marketing/campanhas');
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao disparar campanha', variant: 'destructive' });
    }
  };

  const isSubmitting = startCampaign.isPending || scheduleCampaign.isPending || isSaving;

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Topbar */}
      <header className="flex items-center gap-3 border-b border-border/60 px-6 py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/marketing/campanhas')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Campanhas
        </Button>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold leading-none">Nova Campanha de Email</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Passo {step + 1} de {STEPS.length} · {STEPS[step].title}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Stepper lateral */}
        <aside className="hidden md:flex w-64 shrink-0 flex-col gap-1 border-r border-border/60 p-4">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <button
                key={s.n}
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={cn(
                  'flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  active && 'bg-primary/10',
                  !active && i < step && 'hover:bg-muted/50 cursor-pointer',
                  i > step && 'opacity-50 cursor-not-allowed',
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    active && 'bg-primary text-primary-foreground',
                    done && 'bg-primary/20 text-primary',
                    !active && !done && 'bg-muted text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : s.n}
                </div>
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                    {s.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{s.desc}</p>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Conteúdo do passo */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* 01 — Identidade */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Identidade da campanha</h2>
                  <p className="text-sm text-muted-foreground">Dá um nome pra você achar depois.</p>
                </div>
                <div className="space-y-2">
                  <Label>Nome da campanha</Label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Newsletter Março"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição (opcional)</Label>
                  <Textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Anota o objetivo dessa campanha..."
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* 02 — Remetente */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Remetente</h2>
                  <p className="text-sm text-muted-foreground">
                    De quem o email vai parecer que veio. Preenchido automaticamente das suas configs.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do remetente</Label>
                    <Input
                      value={fromName}
                      onChange={e => setFromName(e.target.value)}
                      placeholder={brevoSettings?.sender_name || 'Sua Empresa'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email do remetente</Label>
                    <Input
                      value={fromEmail}
                      onChange={e => setFromEmail(e.target.value)}
                      placeholder={brevoSettings?.sender_email || 'contato@...'}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Reply-To (opcional)</Label>
                  <Input
                    value={replyTo}
                    onChange={e => setReplyTo(e.target.value)}
                    placeholder="respostas@..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Pra onde vão as respostas, se for diferente do email do remetente.
                  </p>
                </div>
              </div>
            )}

            {/* 03 — Audiência */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Audiência</h2>
                    <p className="text-sm text-muted-foreground">Quem vai receber essa campanha.</p>
                  </div>
                  <Badge variant="outline" className="gap-1 shrink-0">
                    <Users className="h-3 w-3" /> {audienceCount ?? '...'} leads
                  </Badge>
                </div>
                <EmailAudiencePicker filters={filters} onChange={setFilters} />
              </div>
            )}

            {/* 04 — Conteúdo */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Conteúdo</h2>
                  <p className="text-sm text-muted-foreground">Assunto do email e o template.</p>
                </div>
                <div className="space-y-2">
                  <Label>Assunto do email</Label>
                  <Input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Ex: Novidades que você precisa ver"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Template</Label>
                  {selectedTemplate ? (
                    <Card>
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{selectedTemplate.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {selectedTemplate.subject || 'Sem assunto'}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>
                            Trocar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <EmailTemplateGallery
                      selectable
                      onSelect={t => {
                        setSelectedTemplate(t);
                        if (!subject.trim() && t.subject) setSubject(t.subject);
                      }}
                      onEditTemplate={() => {}}
                      onNewTemplate={() => {}}
                    />
                  )}
                </div>
              </div>
            )}

            {/* 05 — Envio */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Envio</h2>
                  <p className="text-sm text-muted-foreground">Disparar agora ou agendar pra depois.</p>
                </div>

                <RadioGroup
                  value={sendMode}
                  onValueChange={v => setSendMode(v as 'now' | 'schedule')}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <label
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-all',
                      sendMode === 'now' ? 'border-primary ring-2 ring-primary/30' : 'hover:bg-muted/40',
                    )}
                  >
                    <RadioGroupItem value="now" className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Send className="h-4 w-4" /> Enviar agora
                      </p>
                      <p className="text-xs text-muted-foreground">Dispara assim que você confirmar.</p>
                    </div>
                  </label>
                  <label
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-all',
                      sendMode === 'schedule' ? 'border-primary ring-2 ring-primary/30' : 'hover:bg-muted/40',
                    )}
                  >
                    <RadioGroupItem value="schedule" className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Clock className="h-4 w-4" /> Agendar
                      </p>
                      <p className="text-xs text-muted-foreground">Escolhe data e hora do disparo.</p>
                    </div>
                  </label>
                </RadioGroup>

                {sendMode === 'schedule' && (
                  <div className="space-y-2">
                    <Label>Data e hora</Label>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                    />
                  </div>
                )}

                <Card className="border-dashed">
                  <CardContent className="p-4 space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Beaker className="h-4 w-4" /> Enviar teste
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Manda 1 email pra você conferir antes do disparo real (não conta na audiência).
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={testEmail}
                        onChange={e => setTestEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        onClick={handleSendTest}
                        disabled={sendTest.isPending || !selectedTemplate}
                      >
                        {sendTest.isPending ? 'Enviando...' : 'Enviar teste'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* 06 — Revisão */}
            {step === 5 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Revisão</h2>
                  <p className="text-sm text-muted-foreground">Confere tudo antes de disparar.</p>
                </div>
                <Card>
                  <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Campanha:</span> {name || '-'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Assunto:</span> {subject || '-'}
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">De:</span>{' '}
                      {(fromName || brevoSettings?.sender_name) || '-'} &lt;
                      {(fromEmail || brevoSettings?.sender_email) || '-'}&gt;
                    </div>
                    <div>
                      <span className="text-muted-foreground">Template:</span> {selectedTemplate?.name || '-'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Audiência:</span> {audienceCount ?? 0} leads
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Envio:</span>{' '}
                      {sendMode === 'schedule'
                        ? `Agendado ${scheduledAt ? `para ${new Date(scheduledAt).toLocaleString('pt-BR')}` : ''}`
                        : 'Agora'}
                    </div>
                  </CardContent>
                </Card>
                {selectedTemplate && (
                  <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> Ver preview do email
                  </Button>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Footer com navegação */}
      <footer className="flex items-center justify-between border-t border-border/60 px-6 py-4">
        <Button variant="ghost" onClick={handleBack} disabled={isSubmitting}>
          <ChevronLeft className="h-4 w-4 mr-1" /> {step === 0 ? 'Cancelar' : 'Voltar'}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={handleNext} disabled={!canNext() || isSaving}>
            {isSaving ? 'Salvando...' : 'Próximo'} <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isSubmitting || !canNext()}>
            {sendMode === 'schedule' ? (
              <>
                <Clock className="h-4 w-4 mr-1" /> {isSubmitting ? 'Agendando...' : 'Agendar'}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" /> {isSubmitting ? 'Enviando...' : 'Enviar'}
              </>
            )}
          </Button>
        )}
      </footer>

      <EmailPreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        html={selectedTemplate?.html_content || ''}
        subject={subject}
      />
    </div>
  );
}
