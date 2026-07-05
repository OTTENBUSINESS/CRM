import { useState, useEffect } from 'react';
import { render } from '@maily-to/render';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Monitor, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentJson?: any;
  html?: string;
  subject?: string;
  preheader?: string;
}

export function EmailPreviewModal({ open, onOpenChange, contentJson, html, subject, preheader }: Props) {
  const [renderedHtml, setRenderedHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    if (!open) return;
    if (html) {
      setRenderedHtml(html);
      return;
    }
    if (!contentJson) {
      setRenderedHtml('<p style="padding:40px;text-align:center;color:#999;">Sem conteúdo</p>');
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const out = await render(contentJson);
        setRenderedHtml(out);
      } catch (e: any) {
        setRenderedHtml(`<p style="padding:40px;color:red;">Erro ao renderizar: ${e.message}</p>`);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, contentJson, html]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="p-4 border-b flex-row items-center justify-between space-y-0">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base">Preview do email</DialogTitle>
            {subject && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                <strong>Assunto:</strong> {subject}
                {preheader && <span className="opacity-60 ml-2">— {preheader}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 mr-8">
            <Button
              variant={view === 'desktop' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('desktop')}
              className={cn('h-7 px-2.5 gap-1', view === 'desktop' && 'bg-background shadow-sm hover:bg-background')}
            >
              <Monitor className="h-3.5 w-3.5" /> Desktop
            </Button>
            <Button
              variant={view === 'mobile' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('mobile')}
              className={cn('h-7 px-2.5 gap-1', view === 'mobile' && 'bg-background shadow-sm hover:bg-background')}
            >
              <Smartphone className="h-3.5 w-3.5" /> Mobile
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/40 flex items-start justify-center p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-[#BAA05E]" />
            </div>
          ) : (
            <div
              className={cn(
                'bg-white rounded-lg shadow-xl transition-all',
                view === 'desktop' ? 'w-full max-w-2xl' : 'w-[375px]',
              )}
            >
              <iframe
                srcDoc={renderedHtml}
                title="Preview"
                className="w-full rounded-lg"
                style={{ height: '70vh', border: 'none' }}
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
