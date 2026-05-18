import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Globe,
  Megaphone,
  Tag,
  Link2,
  CheckCircle2,
  XCircle,
  Clock,
  Smartphone,
  Hash,
  FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface DealOriginCardProps {
  dealId: string;
  leadId: string | null;
}

interface OriginData {
  // Lead source
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_page: string | null;
  referrer: string | null;
  context: string | null;
  source: string | null;
  // Webinar (se este deal veio de webinario)
  webinar?: {
    id: string;
    title: string;
    event_date: string | null;
    enrolled_at: string;
    attended: boolean | null;
    attended_duration: number | null;
  } | null;
}

const SOURCE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  facebook: { label: 'Facebook Ads', icon: Megaphone, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  instagram: { label: 'Instagram', icon: Megaphone, color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' },
  ig: { label: 'Instagram', icon: Megaphone, color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' },
  google: { label: 'Google Ads', icon: Megaphone, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  whatsapp: { label: 'WhatsApp', icon: Smartphone, color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  organic: { label: 'Orgânico', icon: Globe, color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300' },
  direct: { label: 'Direto', icon: Globe, color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300' },
};

export function DealOriginCard({ dealId, leadId }: DealOriginCardProps) {
  const { data: origin, isLoading } = useQuery({
    queryKey: ['deal-origin', dealId, leadId],
    queryFn: async (): Promise<OriginData | null> => {
      if (!leadId) return null;

      // 1. Buscar UTMs e contexto do lead
      const { data: lead } = await supabase
        .from('leads')
        .select('utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_page, referrer, context, source')
        .eq('id', leadId)
        .single();

      // 2. Buscar enrollment de webinario vinculado a ESTE deal especifico
      const { data: enrollment } = await supabase
        .from('lead_webinar_enrollments')
        .select('id, enrolled_at, webinar_config:webinar_config(id, title, event_date)')
        .eq('deal_id', dealId)
        .maybeSingle();

      let webinarData: OriginData['webinar'] = null;
      if (enrollment && (enrollment as any).webinar_config) {
        const wc = (enrollment as any).webinar_config;
        // Buscar atendencia via webinar_config_id (FK direta, sem match por nome)
        const { data: reg } = await supabase
          .from('event_registrations')
          .select('attended, total_duration_minutes')
          .eq('lead_id', leadId)
          .eq('webinar_config_id', wc.id)
          .maybeSingle();
        webinarData = {
          id: wc.id,
          title: wc.title,
          event_date: wc.event_date,
          enrolled_at: (enrollment as any).enrolled_at,
          attended: reg?.attended ?? null,
          attended_duration: reg?.total_duration_minutes ?? null,
        };
      }

      return {
        utm_source: lead?.utm_source || null,
        utm_medium: lead?.utm_medium || null,
        utm_campaign: lead?.utm_campaign || null,
        utm_content: lead?.utm_content || null,
        utm_term: lead?.utm_term || null,
        landing_page: lead?.landing_page || null,
        referrer: lead?.referrer || null,
        context: lead?.context || null,
        source: (lead as any)?.source || null,
        webinar: webinarData,
      };
    },
    enabled: !!leadId,
  });

  if (isLoading || !origin) return null;

  const hasAnyData =
    origin.webinar ||
    origin.utm_source ||
    origin.utm_campaign ||
    origin.landing_page ||
    origin.context;

  if (!hasAnyData) return null;

  const sourceConfig = origin.utm_source
    ? SOURCE_LABELS[origin.utm_source.toLowerCase()] || {
        label: origin.utm_source,
        icon: Globe,
        color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
      }
    : null;
  const SourceIcon = sourceConfig?.icon || Globe;

  // Webinar status
  let webinarStatusBadge: React.ReactNode = null;
  if (origin.webinar) {
    const eventDate = origin.webinar.event_date ? new Date(origin.webinar.event_date) : null;
    const eventHasHappened = eventDate ? eventDate <= new Date() : false;
    if (!eventHasHappened) {
      webinarStatusBadge = (
        <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400">
          <Clock className="h-3 w-3" /> Aguardando
        </Badge>
      );
    } else if (origin.webinar.attended) {
      const mins = origin.webinar.attended_duration || 0;
      const durStr = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? `${mins % 60}min` : ''}` : `${mins}min`;
      webinarStatusBadge = (
        <Badge variant="outline" className="gap-1 border-green-500/30 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" /> Compareceu {mins > 0 && `· ${durStr}`}
        </Badge>
      );
    } else {
      webinarStatusBadge = (
        <Badge variant="outline" className="gap-1 border-red-500/30 text-red-600 dark:text-red-400">
          <XCircle className="h-3 w-3" /> Faltou
        </Badge>
      );
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4 text-violet-500" />
          Origem da Oportunidade
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bloco 1: Webinario (se houver) */}
        {origin.webinar && (
          <div className="p-3 rounded-lg border border-violet-200/50 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-900/30 space-y-2">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{origin.webinar.title}</p>
                  {webinarStatusBadge}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                  <span>Inscrito {format(new Date(origin.webinar.enrolled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                  {origin.webinar.event_date && (
                    <>
                      <span>·</span>
                      <span>Evento {format(new Date(origin.webinar.event_date), "dd/MM/yy", { locale: ptBR })}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bloco 2: Origem do trafego (UTMs) */}
        {(origin.utm_source || origin.utm_campaign) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tráfego</p>
            <div className="flex items-center gap-2 flex-wrap">
              {sourceConfig && (
                <Badge className={cn('gap-1', sourceConfig.color, 'border-0')}>
                  <SourceIcon className="h-3 w-3" />
                  {sourceConfig.label}
                </Badge>
              )}
              {origin.utm_medium && (
                <Badge variant="outline" className="text-xs">{origin.utm_medium}</Badge>
              )}
            </div>
            {origin.utm_campaign && (
              <div className="flex items-start gap-2 text-xs">
                <Hash className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-muted-foreground">Campanha:</span>
                  <span className="ml-1 font-mono break-all">{origin.utm_campaign}</span>
                </div>
              </div>
            )}
            {origin.utm_content && (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">Conteúdo:</span>
                <span className="font-mono break-all">{origin.utm_content}</span>
              </div>
            )}
            {origin.utm_term && (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">Termo:</span>
                <span className="font-mono break-all">{origin.utm_term}</span>
              </div>
            )}
          </div>
        )}

        {/* Bloco 3: Landing page / referrer */}
        {(origin.landing_page || origin.referrer) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Página de Captura</p>
            {origin.landing_page && (
              <div className="flex items-start gap-2 text-xs">
                <Link2 className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                <a
                  href={origin.landing_page}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-600 dark:text-violet-400 hover:underline break-all"
                >
                  {origin.landing_page}
                </a>
              </div>
            )}
            {origin.referrer && (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">Veio de:</span>
                <span className="font-mono break-all text-muted-foreground">{origin.referrer}</span>
              </div>
            )}
          </div>
        )}

        {/* Bloco 4: Contexto (do quiz, anotacoes etc) */}
        {origin.context && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contexto</p>
            <div className="flex items-start gap-2 text-xs">
              <FileText className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-muted-foreground whitespace-pre-wrap line-clamp-6">{origin.context}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
