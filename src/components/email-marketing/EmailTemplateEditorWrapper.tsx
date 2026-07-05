import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Save, Send, Eye, AlertTriangle, Loader2, Mail, Sparkles, Slash, AtSign } from 'lucide-react';
import { render } from '@maily-to/render';
import { MailyEditor } from '@/components/marketing/MailyEditor';
import { useCreateEmailTemplate, useUpdateEmailTemplate, useEmailTemplate, useSendTestEmail } from '@/hooks/useEmailMarketing';
import { useToast } from '@/hooks/use-toast';
import EmailPreviewModal from './EmailPreviewModal';
import EmailAttachmentUploader from './EmailAttachmentUploader';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  templateId?: string;
  onBack: () => void;
}

const DEFAULT_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { textAlign: 'left' },
      content: [
        { type: 'text', text: 'Olá, ' },
        { type: 'text', text: '@nome' },
        { type: 'text', text: '!' },
      ],
    },
    {
      type: 'paragraph',
      attrs: { textAlign: 'left' },
      content: [
        { type: 'text', text: 'Comece a editar este template. Use ' },
        { type: 'text', marks: [{ type: 'code' }], text: '/' },
        { type: 'text', text: ' para inserir blocos e ' },
        { type: 'text', marks: [{ type: 'code' }], text: '@' },
        { type: 'text', text: ' para variáveis (nome, primeiro_nome, empresa, etc).' },
      ],
    },
  ],
};

function isMailyJson(json: any): boolean {
  return !!json && typeof json === 'object' && json.type === 'doc' && Array.isArray(json.content);
}

export default function EmailTemplateEditorWrapper({ templateId, onBack }: Props) {
  const { data: existingTemplate, isLoading } = useEmailTemplate(templateId);
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  const sendTest = useSendTestEmail();
  const { toast } = useToast();
  const editorRef = useRef<any>(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [initialJson, setInitialJson] = useState<any>(null);
  const [legacyHtml, setLegacyHtml] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    if (templateId && !existingTemplate) return;
    hydratedRef.current = true;

    if (!existingTemplate) {
      setInitialJson(DEFAULT_CONTENT);
      return;
    }

    setName(existingTemplate.name || '');
    setSubject(existingTemplate.subject || '');
    if (isMailyJson(existingTemplate.design_json)) {
      setInitialJson(existingTemplate.design_json);
      setLegacyHtml(null);
    } else if (existingTemplate.design_json) {
      setInitialJson(DEFAULT_CONTENT);
      setLegacyHtml(existingTemplate.html_content || null);
      toast({
        title: 'Template legado',
        description: 'Este template foi criado no editor antigo. Recriei vazio — você pode ver o HTML antigo no botão de preview.',
      });
    } else {
      setInitialJson(DEFAULT_CONTENT);
    }
  }, [templateId, existingTemplate, toast]);

  useEffect(() => {
    const id = 'maily-editor-css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = '/maily-editor.css';
    document.head.appendChild(link);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, []);

  const getCurrentJson = () => editorRef.current?.getJSON?.() || initialJson || DEFAULT_CONTENT;

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Informe o nome do template', variant: 'destructive' });
      return;
    }

    try {
      const json = getCurrentJson();
      const html = await render(json);

      if (templateId && existingTemplate) {
        await updateTemplate.mutateAsync({
          id: templateId,
          name,
          subject,
          html_content: html,
          design_json: json,
        });
        toast({ title: 'Template atualizado' });
      } else {
        await createTemplate.mutateAsync({
          name,
          subject,
          html_content: html,
          design_json: json,
        });
        toast({ title: 'Template criado' });
      }
      onBack();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao salvar template', variant: 'destructive' });
    }
  };

  const handlePreview = async () => {
    try {
      const json = getCurrentJson();
      const html = await render(json);
      setPreviewHtml(html);
      setShowPreview(true);
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao renderizar preview', variant: 'destructive' });
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim() || !testEmail.includes('@')) {
      toast({ title: 'Informe um email válido', variant: 'destructive' });
      return;
    }
    try {
      const json = getCurrentJson();
      const html = await render(json);
      await sendTest.mutateAsync({
        to: testEmail.trim(),
        subject: subject || 'Teste de Template',
        html_content: html,
      });
      toast({ title: `Teste enviado para ${testEmail.trim()}` });
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao enviar teste', variant: 'destructive' });
    }
  };

  if ((isLoading && templateId) || initialJson === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#BAA05E]" />
      </div>
    );
  }

  const isEditing = !!templateId;
  const saving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-muted/10">
      {/* Topbar — editorial slim */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 shrink-0">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
            </Button>
            <div className="h-5 w-px bg-border shrink-0" />
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                Template Email
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#BAA05E]/10 text-[#BAA05E] font-medium uppercase tracking-wider">
                {isEditing ? 'Editando' : 'Novo'}
              </span>
            </div>
            <div className="h-5 w-px bg-border shrink-0" />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sem título"
              className="h-9 text-sm font-semibold border-none shadow-none px-2 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-1 focus-visible:ring-[#BAA05E]/30 max-w-md"
            />
            {legacyHtml && (
              <span className="text-xs text-amber-600 flex items-center gap-1 shrink-0">
                <AlertTriangle className="h-3 w-3" /> Template antigo recriado
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePreview}>
              <Eye className="h-3.5 w-3.5" /> Preview
            </Button>
            <Button
              size="sm"
              className="bg-[#BAA05E] hover:bg-[#917D3D] text-white gap-1.5"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </header>

      {/* Body: 2 colunas */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_1fr] overflow-hidden">
        {/* Sidebar config */}
        <aside className="border-r overflow-y-auto p-5 space-y-5 bg-background/40">
          {/* Detalhes */}
          <section className="space-y-3">
            <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
              Detalhes
            </Label>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Assunto do email</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Bem-vindo à nossa marca"
                  className="text-sm h-9"
                />
              </div>
            </div>
          </section>

          {/* Atalhos */}
          <section className="space-y-3">
            <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Atalhos do editor
            </Label>
            <Card className="border-[#BAA05E]/15 bg-[#BAA05E]/[0.03]">
              <CardContent className="p-3 space-y-2.5 text-xs">
                <div className="flex items-start gap-2.5">
                  <kbd className="mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded bg-background border text-[10px] font-mono shrink-0">
                    /
                  </kbd>
                  <div className="text-muted-foreground leading-snug">
                    <span className="text-foreground font-medium">Inserir bloco</span>
                    <p className="text-[11px] mt-0.5">texto, título, imagem, botão, divisor…</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <kbd className="mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded bg-background border text-[10px] font-mono shrink-0">
                    @
                  </kbd>
                  <div className="text-muted-foreground leading-snug">
                    <span className="text-foreground font-medium">Inserir variável</span>
                    <p className="text-[11px] mt-0.5">nome, primeiro_nome, empresa, vendedor…</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Enviar teste */}
          <section className="space-y-3">
            <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> Enviar teste
            </Label>
            <Card className="border-dashed">
              <CardContent className="p-3 space-y-2.5">
                <p className="text-xs text-muted-foreground leading-snug">
                  Envie pra você mesmo antes de criar a campanha. Variáveis viram valores fictícios.
                </p>
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="text-sm h-9 pl-8"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSendTest();
                        }
                      }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 h-9 border-[#BAA05E]/30 text-[#917D3D] hover:bg-[#BAA05E]/10 hover:text-[#917D3D]"
                    onClick={handleSendTest}
                    disabled={sendTest.isPending}
                  >
                    {sendTest.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {sendTest.isPending ? 'Enviando…' : 'Enviar email de teste'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Anexos */}
          <EmailAttachmentUploader />

          {/* Variáveis disponíveis */}
          <section className="space-y-3">
            <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium flex items-center gap-1.5">
              <AtSign className="h-3 w-3" /> Variáveis disponíveis
            </Label>
            <div className="flex flex-wrap gap-1">
              {[
                'nome',
                'primeiro_nome',
                'empresa',
                'email',
                'telefone',
                'cidade',
                'estado',
                'vendedor',
              ].map((v) => (
                <span
                  key={v}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border"
                >
                  @{v}
                </span>
              ))}
            </div>
          </section>
        </aside>

        {/* Editor */}
        <main className="overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6">
            <div className="bg-background rounded-2xl border shadow-sm">
              <MailyEditor
                key={templateId || 'new'}
                contentJson={initialJson}
                onCreate={(editor) => {
                  editorRef.current = editor;
                }}
                onUpdate={(editor) => {
                  editorRef.current = editor;
                }}
              />
            </div>
          </div>
        </main>
      </div>

      <EmailPreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        html={previewHtml || legacyHtml || ''}
        subject={subject}
      />
    </div>
  );
}
