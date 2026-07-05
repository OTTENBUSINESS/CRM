import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, Copy, Check, ExternalLink, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface UploadedFile {
  name: string;
  url: string;
  size: number;
}

interface Props {
  /** Identifica o tenant — vai num path próprio dentro do bucket */
  _tenantId?: string;
}

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function EmailAttachmentUploader(_props: Props = {}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleSelect = () => inputRef.current?.click();

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];

    if (file.size > MAX_SIZE) {
      toast({ title: `Arquivo muito grande (max ${formatSize(MAX_SIZE)})`, variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
      const path = `attachments/attachments/${crypto.randomUUID()}-${safe}`;

      const { error } = await supabase.storage
        .from('email-assets')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;

      const { data } = supabase.storage.from('email-assets').getPublicUrl(path);
      const uploaded: UploadedFile = { name: file.name, url: data.publicUrl, size: file.size };
      setFiles((prev) => [uploaded, ...prev]);
      toast({ title: 'Arquivo enviado — copie a URL e cole no botão do email' });
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao enviar arquivo', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 1500);
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const removeFile = (url: string) => {
    setFiles((prev) => prev.filter((f) => f.url !== url));
  };

  return (
    <section className="space-y-3">
      <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium flex items-center gap-1.5">
        <FileText className="h-3 w-3" /> Anexos (PDF, DOCX, etc)
      </Label>

      <Card className="border-dashed">
        <CardContent className="p-3 space-y-2.5">
          <p className="text-xs text-muted-foreground leading-snug">
            Faça upload, copie a URL e cole no <span className="font-medium">botão</span> do
            editor (bloco Botão → URL). Quando o lead clicar, abre o arquivo.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt,application/pdf"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 h-9 border-[#BAA05E]/30 text-[#917D3D] hover:bg-[#BAA05E]/10 hover:text-[#917D3D]"
            onClick={handleSelect}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? 'Enviando…' : 'Enviar arquivo'}
          </Button>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div
              key={f.url}
              className="group flex items-center gap-2 p-2 rounded-md border bg-background/60 hover:bg-accent/30 transition-colors"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{f.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatSize(f.size)}</p>
              </div>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded hover:bg-muted"
                title="Abrir"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <button
                type="button"
                onClick={() => copyUrl(f.url)}
                className="p-1 rounded hover:bg-muted"
                title="Copiar URL"
              >
                {copiedUrl === f.url ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
              <button
                type="button"
                onClick={() => removeFile(f.url)}
                className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remover da lista (não exclui do storage)"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
