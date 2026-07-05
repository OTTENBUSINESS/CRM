import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Send, Clock, Users, Eye, Beaker } from 'lucide-react';
import {
  useCreateEmailCampaign,
  useUpdateEmailCampaign,
  useStartEmailCampaign,
  useScheduleEmailCampaign,
  useSendEmailCampaignTest,
  useEmailAudienceCount,
  useEmailTemplates,
  useEmailCampaign,
  useBrevoSettings,
} from '@/hooks/useEmailMarketing';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { EmailAudienceFilters, EmailTemplate } from '@/types/email.types';
import EmailAudiencePicker from './EmailAudiencePicker';
import EmailPreviewModal from './EmailPreviewModal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId?: string | null;
}

export default function EmailCampaignForm({ open, onOpenChange, editId }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: brevoSettings } = useBrevoSettings();
  const { data: templates } = useEmailTemplates();
  const { data: editingCampaign } = useEmailCampaign(editId || undefined);
  const createCampaign = useCreateEmailCampaign();
  const updateCampaign = useUpdateEmailCampaign();
  const startCampaign = useStartEmailCampaign();
  const scheduleCampaign = useScheduleEmailCampaign();
  const sendTest = useSendEmailCampaignTest();

  const [step, setStep] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState(brevoSettings?.sender_name || '');
  const [fromEmail, setFromEmail] = useState(brevoSettings?.sender_email || '');
  const [replyTo, setReplyTo] = useState('');
  const [filters, setFilters] = useState<EmailAudienceFilters>({});
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState(user?.email || '');
  const [hydratedForId, setHydratedForId] = useState<string | null>(null);

  // Hidrata form a partir de campanha existente (modo edição)
  useEffect(() => {
    if (!open) return;
    if (!editId) {
      // Modo criação: garante que está limpo se trocou de modo
      if (hydratedForId !== null) setHydratedForId(null);
      return;
    }
    if (!editingCampaign || hydratedForId === editId) return;
    setName(editingCampaign.name || '');
    setSubject(editingCampaign.subject || '');
    setFromName(editingCampaign.from_name || brevoSettings?.sender_name || '');
    setFromEmail(editingCampaign.from_email || brevoSettings?.sender_email || '');
    setReplyTo(editingCampaign.reply_to || '');
    setFilters((editingCampaign.audience_filters || {}) as EmailAudienceFilters);
    setScheduledAt(editingCampaign.scheduled_at ? editingCampaign.scheduled_at.slice(0, 16) : '');
    setCampaignId(editingCampaign.id);
    if (editingCampaign.template_id && templates) {
      const tpl = templates.find(t => t.id === editingCampaign.template_id) || null;
      setSelectedTemplate(tpl);
    }
    setHydratedForId(editId);
  }, [open, editId, editingCampaign, templates, brevoSettings, hydratedForId]);

  const { data: audienceCount } = useEmailAudienceCount(filters);

  const steps = ['Basico', 'Audiencia', 'Conteudo', 'Revisao'];

  const canNext = () => {
    if (step === 0) return name.trim() && subject.trim();
    if (step === 1) return (audienceCount || 0) > 0;
    if (step === 2) return !!selectedTemplate;
    return true;
  };

  const handleNext = async () => {
    if (step === 0) {
      try {
        if (campaignId) {
          // Update — modo edição ou já criou rascunho
          await updateCampaign.mutateAsync({
            id: campaignId,
            name,
            subject,
            from_name: fromName || brevoSettings?.sender_name || '',
            from_email: fromEmail || brevoSettings?.sender_email || '',
            reply_to: replyTo || null,
          });
        } else {
          const campaign = await createCampaign.mutateAsync({
            name,
            subject,
            from_name: fromName || brevoSettings?.sender_name || '',
            from_email: fromEmail || brevoSettings?.sender_email || '',
            reply_to: replyTo || null,
          });
          setCampaignId(campaign.id);
        }
      } catch {
        toast({ title: 'Erro ao salvar campanha', variant: 'destructive' });
        return;
      }
    }

    if (step === 1 && campaignId) {
      await updateCampaign.mutateAsync({ id: campaignId, audience_filters: filters as any });
    }

    if (step === 2 && campaignId && selectedTemplate) {
      await updateCampaign.mutateAsync({
        id: campaignId,
        template_id: selectedTemplate.id,
        html_content: selectedTemplate.html_content,
        subject: subject,
      });
    }

    setStep(s => s + 1);
  };

  const handleSend = async () => {
    if (!campaignId) return;
    try {
      await startCampaign.mutateAsync(campaignId);
      toast({ title: 'Campanha iniciada!' });
      resetAndClose();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao iniciar campanha', variant: 'destructive' });
    }
  };

  const handleSchedule = async () => {
    if (!campaignId || !scheduledAt) return;
    try {
      await scheduleCampaign.mutateAsync({ campaignId, scheduledAt });
      toast({ title: 'Campanha agendada!' });
      resetAndClose();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao agendar', variant: 'destructive' });
    }
  };

  const resetAndClose = () => {
    setStep(0);
    setName('');
    setSubject('');
    setFromName('');
    setFromEmail('');
    setReplyTo('');
    setFilters({});
    setSelectedTemplate(null);
    setScheduledAt('');
    setCampaignId(null);
    setTestEmail(user?.email || '');
    setHydratedForId(null);
    onOpenChange(false);
  };

  const handleSendTest = async () => {
    if (!campaignId || !selectedTemplate) {
      toast({ title: 'Selecione um template antes de enviar teste', variant: 'destructive' });
      return;
    }
    if (!testEmail.trim() || !testEmail.includes('@')) {
      toast({ title: 'Informe um email válido', variant: 'destructive' });
      return;
    }
    try {
      await sendTest.mutateAsync({
        campaignId,
        testEmail: testEmail.trim(),
        html: selectedTemplate.html_content,
      });
      toast({ title: `Teste enviado para ${testEmail.trim()}` });
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao enviar teste', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editId ? 'Editar Campanha' : 'Nova Campanha Email'}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {i + 1}
              </div>
              <span className={`text-xs ${i === step ? 'font-medium' : 'text-muted-foreground'}`}>{s}</span>
              {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Step 0: Basico */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <Label>Nome da Campanha</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Newsletter Março" />
            </div>
            <div>
              <Label>Assunto do Email</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex: Conheça a Sua Empresa" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome do Remetente</Label>
                <Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder={brevoSettings?.sender_name || 'Sua Empresa'} />
              </div>
              <div>
                <Label>Email do Remetente</Label>
                <Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder={brevoSettings?.sender_email || 'contato@...'} />
              </div>
            </div>
            <div>
              <Label>Reply-To (opcional)</Label>
              <Input value={replyTo} onChange={e => setReplyTo(e.target.value)} placeholder="respostas@..." />
            </div>
          </div>
        )}

        {/* Step 1: Audiencia */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Selecione a audiencia</h3>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" /> {audienceCount ?? '...'} leads com email
              </Badge>
            </div>
            <EmailAudiencePicker filters={filters} onChange={setFilters} />
          </div>
        )}

        {/* Step 2: Conteudo */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Selecione o template</h3>
            {selectedTemplate ? (
              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{selectedTemplate.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedTemplate.subject}</p>
                  </div>
                  <div className="flex gap-2">
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
              <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
                {(templates || []).map(t => (
                  <Card
                    key={t.id}
                    className="cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => setSelectedTemplate(t)}
                  >
                    <CardContent className="p-3">
                      <p className="font-medium text-sm truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.subject || 'Sem assunto'}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Revisao */}
        {step === 3 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Campanha:</span> {name}</div>
                  <div><span className="text-muted-foreground">Assunto:</span> {subject}</div>
                  <div><span className="text-muted-foreground">De:</span> {fromName || brevoSettings?.sender_name} &lt;{fromEmail || brevoSettings?.sender_email}&gt;</div>
                  <div><span className="text-muted-foreground">Template:</span> {selectedTemplate?.name}</div>
                  <div><span className="text-muted-foreground">Audiencia:</span> {audienceCount} leads</div>
                </div>
              </CardContent>
            </Card>

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

            <div className="space-y-2">
              <Label>Agendar (opcional)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="ghost" onClick={() => step > 0 ? setStep(s => s - 1) : resetAndClose()}>
            <ChevronLeft className="h-4 w-4 mr-1" /> {step > 0 ? 'Voltar' : 'Cancelar'}
          </Button>

          {step < 3 ? (
            <Button onClick={handleNext} disabled={!canNext()}>
              Proximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <div className="flex gap-2">
              {scheduledAt && (
                <Button variant="outline" onClick={handleSchedule} disabled={scheduleCampaign.isPending}>
                  <Clock className="h-4 w-4 mr-1" /> Agendar
                </Button>
              )}
              <Button onClick={handleSend} disabled={startCampaign.isPending}>
                <Send className="h-4 w-4 mr-1" /> Enviar Agora
              </Button>
            </div>
          )}
        </div>

        <EmailPreviewModal
          open={showPreview}
          onOpenChange={setShowPreview}
          html={selectedTemplate?.html_content || ''}
          subject={subject}
        />
      </DialogContent>
    </Dialog>
  );
}
