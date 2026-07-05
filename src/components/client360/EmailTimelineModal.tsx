import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Mail,
  User,
  Calendar,
  Clock,
  Eye,
  MousePointerClick,
  AlertTriangle,
  ExternalLink,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: Record<string, any> | null;
  onOpenCampaign?: (campaignId: string) => void;
}

function fmt(dt?: string | null) {
  if (!dt) return null;
  try {
    return format(new Date(dt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return null;
  }
}

export default function EmailTimelineModal({ open, onOpenChange, metadata, onOpenCampaign }: Props) {
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');

  if (!metadata) return null;

  const subject = metadata.subject || 'Email';
  const html = metadata.html || '<p style="padding:40px;text-align:center;color:#999;">Conteúdo do email indisponível</p>';
  const campaignName = metadata.campaign_name;
  const fromLabel = metadata.from_name || metadata.from_email
    ? `${metadata.from_name || ''}${metadata.from_email ? ` <${metadata.from_email}>` : ''}`.trim()
    : null;

  const events: Array<{ icon: any; label: string; date: string | null; color: string }> = [
    { icon: Mail, label: 'Enviado', date: metadata.sent_at || null, color: 'text-blue-600' },
    { icon: Mail, label: 'Entregue', date: metadata.delivered_at || null, color: 'text-teal-600' },
    { icon: Eye, label: 'Aberto', date: metadata.opened_at || null, color: 'text-indigo-600' },
    { icon: MousePointerClick, label: 'Clicado', date: metadata.clicked_at || null, color: 'text-purple-600' },
    { icon: AlertTriangle, label: 'Rebatido', date: metadata.bounced_at || null, color: 'text-red-600' },
  ].filter((e) => !!e.date);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] p-0 gap-0 flex flex-col">
        {/* Header com info da campanha */}
        <DialogHeader className="p-5 pb-4 border-b space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                  Email Marketing
                </span>
                {campaignName && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#BAA05E]/10 text-[#BAA05E] font-medium uppercase tracking-wider">
                    Campanha
                  </span>
                )}
              </div>
              <DialogTitle className="text-lg font-semibold leading-snug">
                {subject}
              </DialogTitle>
              {campaignName && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Campanha: <span className="font-medium text-foreground">{campaignName}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 mr-8 shrink-0">
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
          </div>

          {/* Detalhes envio */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 text-xs">
            {fromLabel && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">De</div>
                <div className="flex items-center gap-1.5 text-foreground">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{fromLabel}</span>
                </div>
              </div>
            )}
            {metadata.to_email && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Para</div>
                <div className="flex items-center gap-1.5 text-foreground">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{metadata.to_email}</span>
                </div>
              </div>
            )}
            {metadata.sent_at && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Enviado em</div>
                <div className="flex items-center gap-1.5 text-foreground">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span>{fmt(metadata.sent_at)}</span>
                </div>
              </div>
            )}
            {(metadata.open_count > 0 || metadata.click_count > 0) && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Engajamento</div>
                <div className="flex items-center gap-2">
                  {metadata.open_count > 0 && (
                    <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 text-xs">
                      <Eye className="h-3 w-3" /> {metadata.open_count}
                    </span>
                  )}
                  {metadata.click_count > 0 && (
                    <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 text-xs">
                      <MousePointerClick className="h-3 w-3" /> {metadata.click_count}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Mini-timeline de eventos */}
          {events.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {events.map((e, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <e.icon className={cn('h-3 w-3', e.color)} />
                  <span className="text-muted-foreground">{e.label}:</span>
                  <span className="text-foreground font-medium">{fmt(e.date)}</span>
                </div>
              ))}
            </div>
          )}

          {/* URL clicada e bounce reason */}
          {metadata.clicked_url && (
            <div className="text-xs flex items-center gap-1.5 pt-1 text-muted-foreground">
              <ExternalLink className="h-3 w-3" />
              <span>Link clicado:</span>
              <a
                href={metadata.clicked_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 dark:text-purple-400 hover:underline truncate max-w-[400px]"
              >
                {metadata.clicked_url}
              </a>
            </div>
          )}
          {metadata.bounce_reason && (
            <Badge variant="outline" className="border-red-300 text-red-600 self-start">
              {metadata.bounce_reason}
            </Badge>
          )}

          {(metadata.campaign_id && onOpenCampaign) && (
            <Button
              variant="outline"
              size="sm"
              className="self-start gap-1.5 mt-1"
              onClick={() => onOpenCampaign(metadata.campaign_id)}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir campanha
            </Button>
          )}
        </DialogHeader>

        {/* Email body */}
        <div className="flex-1 overflow-auto bg-muted/40 flex items-start justify-center p-4">
          <div
            className={cn(
              'bg-white rounded-lg shadow-xl transition-all',
              view === 'desktop' ? 'w-full max-w-2xl' : 'w-[375px]',
            )}
          >
            <iframe
              srcDoc={html}
              title={subject}
              className="w-full rounded-lg"
              style={{ height: '65vh', border: 'none' }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
