import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Plus, Trash2, Loader2, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreateCloudTemplate } from '@/hooks/useWhatsAppTemplates';
import { AppLayout } from '@/components/layout/AppLayout';

type Category = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

interface TemplateButton {
  type: ButtonType;
  text: string;
  value: string; // URL para URL, telefone para PHONE_NUMBER
}

const NAME_REGEX = /^[a-z0-9_]+$/;

// Substitui {{1}}, {{2}}... pelos exemplos fornecidos (fallback pro próprio placeholder)
function applyVariables(text: string, examples: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
    const idx = Number(n) - 1;
    return examples[idx] || `{{${n}}}`;
  });
}

export default function WhatsAppTemplateNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useCreateCloudTemplate();

  const [category, setCategory] = useState<Category>('MARKETING');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const [header, setHeader] = useState('');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [buttons, setButtons] = useState<TemplateButton[]>([]);

  // Quantas variáveis {{N}} aparecem no corpo
  const varCount = useMemo(() => {
    const matches = body.match(/\{\{(\d+)\}\}/g) || [];
    const nums = matches.map((m) => Number(m.replace(/[^\d]/g, '')));
    return nums.length ? Math.max(...nums) : 0;
  }, [body]);

  const nameValid = name === '' || NAME_REGEX.test(name);

  // Insere a próxima variável sequencial no fim do corpo e cria o campo de exemplo
  const insertVariable = () => {
    const next = varCount + 1;
    setBody((prev) => `${prev}{{${next}}}`);
    setExamples((prev) => {
      const copy = [...prev];
      copy[next - 1] = copy[next - 1] || '';
      return copy;
    });
  };

  const updateExample = (idx: number, value: string) => {
    setExamples((prev) => {
      const copy = [...prev];
      copy[idx] = value;
      return copy;
    });
  };

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons((prev) => [...prev, { type: 'QUICK_REPLY', text: '', value: '' }]);
  };

  const updateButton = (idx: number, patch: Partial<TemplateButton>) => {
    setButtons((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };

  const removeButton = (idx: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSubmit = NAME_REGEX.test(name) && body.trim().length > 0 && !create.isPending;

  // Monta o array `components` no formato esperado pela Meta
  const buildComponents = () => {
    const components: any[] = [];

    if (header.trim()) {
      components.push({ type: 'HEADER', format: 'TEXT', text: header.trim() });
    }

    const bodyComponent: any = { type: 'BODY', text: body };
    if (varCount > 0) {
      // example.body_text é um array de arrays (uma linha de exemplos)
      const filled = Array.from({ length: varCount }, (_, i) => examples[i] || `exemplo${i + 1}`);
      bodyComponent.example = { body_text: [filled] };
    }
    components.push(bodyComponent);

    if (footer.trim()) {
      components.push({ type: 'FOOTER', text: footer.trim() });
    }

    const validButtons = buttons.filter((b) => b.text.trim());
    if (validButtons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: validButtons.map((b) => {
          if (b.type === 'URL') {
            return { type: 'URL', text: b.text.trim(), url: b.value.trim() };
          }
          if (b.type === 'PHONE_NUMBER') {
            return { type: 'PHONE_NUMBER', text: b.text.trim(), phone_number: b.value.trim() };
          }
          return { type: 'QUICK_REPLY', text: b.text.trim() };
        }),
      });
    }

    return components;
  };

  const handleSubmit = async () => {
    try {
      await create.mutateAsync({
        name,
        category,
        language,
        components: buildComponents(),
      });
      toast({ title: 'Template enviado para aprovação da Meta' });
      navigate('/marketing/whatsapp-templates');
    } catch (err: any) {
      toast({
        title: 'Erro ao criar template',
        description: err?.message || 'Falha de rede',
        variant: 'destructive',
      });
    }
  };

  const previewBody = applyVariables(body, examples);

  return (
    <AppLayout>
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/marketing/whatsapp-templates')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Novo Template</h1>
          <p className="text-sm text-muted-foreground">
            Crie um modelo de mensagem para aprovação na Meta
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Coluna do formulário ─────────────────────────── */}
        <div className="space-y-5">
          {/* Categoria */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKETING">Marketing</SelectItem>
                <SelectItem value="UTILITY">Utilidade</SelectItem>
                <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Nome</Label>
            <Input
              id="tpl-name"
              placeholder="ex: boas_vindas_cliente"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              className={!nameValid ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {!nameValid ? (
              <p className="text-[11px] text-red-500">
                Use apenas letras minúsculas, números e underscore (a-z, 0-9, _).
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Minúsculas, números e underscore. Sem espaços.
              </p>
            )}
          </div>

          {/* Idioma */}
          <div className="space-y-2">
            <Label htmlFor="tpl-lang">Idioma</Label>
            <Input
              id="tpl-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </div>

          {/* Header (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="tpl-header">Cabeçalho (opcional)</Label>
            <Input
              id="tpl-header"
              placeholder="Texto do cabeçalho"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
            />
          </div>

          {/* Body (obrigatório) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-body">Corpo *</Label>
              <Button type="button" variant="outline" size="sm" onClick={insertVariable}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Inserir variável
              </Button>
            </div>
            <Textarea
              id="tpl-body"
              placeholder="Olá {{1}}, seu pedido {{2}} foi confirmado!"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
            />

            {/* Exemplos das variáveis */}
            {varCount > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] text-muted-foreground">
                  Exemplos para cada variável (obrigatório pela Meta):
                </p>
                {Array.from({ length: varCount }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[12px] font-mono text-muted-foreground w-12 shrink-0">
                      {`{{${i + 1}}}`}
                    </span>
                    <Input
                      placeholder={`Exemplo para variável ${i + 1}`}
                      value={examples[i] || ''}
                      onChange={(e) => updateExample(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="tpl-footer">Rodapé (opcional)</Label>
            <Input
              id="tpl-footer"
              placeholder="Texto do rodapé"
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
            />
          </div>

          {/* Buttons (opcional) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Botões (opcional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addButton}
                disabled={buttons.length >= 3}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar botão
              </Button>
            </div>
            {buttons.map((b, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <Select
                    value={b.type}
                    onValueChange={(v) => updateButton(i, { type: v as ButtonType })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QUICK_REPLY">Resposta rápida</SelectItem>
                      <SelectItem value="URL">URL</SelectItem>
                      <SelectItem value="PHONE_NUMBER">Telefone</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Texto do botão"
                    value={b.text}
                    onChange={(e) => updateButton(i, { text: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-600 shrink-0"
                    onClick={() => removeButton(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {b.type === 'URL' && (
                  <Input
                    placeholder="https://exemplo.com"
                    value={b.value}
                    onChange={(e) => updateButton(i, { value: e.target.value })}
                  />
                )}
                {b.type === 'PHONE_NUMBER' && (
                  <Input
                    placeholder="+5511999999999"
                    value={b.value}
                    onChange={(e) => updateButton(i, { value: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={!canSubmit}>
                  {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enviar para aprovação
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Enviar template?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O template <strong>{name}</strong> será enviado à Meta para aprovação.
                    Depois de enviado, o nome e o conteúdo não podem ser editados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSubmit}>Confirmar envio</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="ghost"
              onClick={() => navigate('/marketing/whatsapp-templates')}
            >
              Cancelar
            </Button>
          </div>
        </div>

        {/* ── Coluna do preview (estilo WhatsApp) ──────────── */}
        <div className="lg:sticky lg:top-6 h-fit">
          <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            Pré-visualização
          </div>
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: '#0b141a' }}
          >
            <Card className="max-w-sm border-none shadow-sm" style={{ backgroundColor: '#005c4b' }}>
              <CardContent className="p-3 space-y-1.5">
                {header.trim() && (
                  <p className="text-[13px] font-semibold text-white break-words">
                    {header}
                  </p>
                )}
                {body.trim() ? (
                  <p className="text-[13px] text-white/95 whitespace-pre-wrap break-words">
                    {previewBody}
                  </p>
                ) : (
                  <p className="text-[13px] text-white/40 italic">
                    O corpo da mensagem aparecerá aqui...
                  </p>
                )}
                {footer.trim() && (
                  <p className="text-[11px] text-white/60 break-words">{footer}</p>
                )}
                <p className="text-[10px] text-white/50 text-right">12:00</p>
              </CardContent>
            </Card>

            {/* Botões do preview */}
            {buttons.filter((b) => b.text.trim()).length > 0 && (
              <div className="max-w-sm mt-1.5 space-y-1.5">
                {buttons
                  .filter((b) => b.text.trim())
                  .map((b, i) => (
                    <div
                      key={i}
                      className="rounded-lg py-2 text-center text-[13px] font-medium text-sky-400"
                      style={{ backgroundColor: '#1f2c34' }}
                    >
                      {b.text}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </AppLayout>
  );
}
