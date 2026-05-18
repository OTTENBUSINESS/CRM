import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface LeadWebinarsCardProps {
  leadId: string;
}

interface WebinarEnrollment {
  id: string;
  enrolled_at: string;
  webinar_config_id: string;
  deal_id: string | null;
  source: string | null;
  webinar_config: { id: string; title: string; event_date: string | null } | null;
  deal: {
    id: string;
    pipeline_stage_id: string | null;
    status: string;
    pipeline_stage: { name: string; color: string | null } | null;
  } | null;
  attendance: {
    attended: boolean | null;
    total_duration_minutes: number | null;
  } | null;
}

export function LeadWebinarsCard({ leadId }: LeadWebinarsCardProps) {
  const navigate = useNavigate();

  const { data: enrollments, isLoading } = useQuery({
    queryKey: ['lead-webinars', leadId],
    queryFn: async () => {
      const { data: enrolls } = await supabase
        .from('lead_webinar_enrollments')
        .select(
          'id, enrolled_at, webinar_config_id, deal_id, source, webinar_config:webinar_config(id, title, event_date), deal:deals(id, pipeline_stage_id, status, pipeline_stage:sales_pipeline_stages(name, color))'
        )
        .eq('lead_id', leadId)
        .order('enrolled_at', { ascending: false });

      if (!enrolls || enrolls.length === 0) return [];

      // Buscar atendencia em event_registrations via webinar_config_id (FK direta)
      const { data: regs } = await supabase
        .from('event_registrations')
        .select('webinar_config_id, attended, total_duration_minutes')
        .eq('lead_id', leadId)
        .not('webinar_config_id', 'is', null);

      // Mapa por webinar_config_id
      const attendanceByConfigId = new Map<string, { attended: boolean | null; total_duration_minutes: number | null }>();
      (regs || []).forEach((r: any) => {
        if (r.webinar_config_id) {
          attendanceByConfigId.set(r.webinar_config_id, {
            attended: r.attended,
            total_duration_minutes: r.total_duration_minutes,
          });
        }
      });

      return enrolls.map((e: any) => ({
        ...e,
        attendance: attendanceByConfigId.get(e.webinar_config_id) || null,
      })) as WebinarEnrollment[];
    },
  });

  if (isLoading) {
    return null;
  }

  if (!enrollments || enrollments.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          Webinários ({enrollments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {enrollments.map((enr) => {
          const eventDate = enr.webinar_config?.event_date
            ? new Date(enr.webinar_config.event_date)
            : null;
          const eventHasHappened = eventDate ? eventDate <= new Date() : false;

          let statusBadge: React.ReactNode = null;
          if (!eventHasHappened) {
            statusBadge = (
              <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400">
                <Clock className="h-3 w-3" /> Aguardando
              </Badge>
            );
          } else if (enr.attendance?.attended) {
            const mins = enr.attendance.total_duration_minutes || 0;
            const durStr = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? `${mins % 60}min` : ''}` : `${mins}min`;
            statusBadge = (
              <Badge variant="outline" className="gap-1 border-green-500/30 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" /> Compareceu {mins > 0 && `· ${durStr}`}
              </Badge>
            );
          } else {
            statusBadge = (
              <Badge variant="outline" className="gap-1 border-red-500/30 text-red-600 dark:text-red-400">
                <XCircle className="h-3 w-3" /> Faltou
              </Badge>
            );
          }

          return (
            <div
              key={enr.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors',
                enr.deal_id && 'cursor-pointer'
              )}
              onClick={() => {
                if (enr.deal_id) navigate(`/comercial/deals/${enr.deal_id}`);
              }}
            >
              <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm truncate">{enr.webinar_config?.title || 'Webinário'}</p>
                  {statusBadge}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>Inscrito {format(new Date(enr.enrolled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                  {eventDate && (
                    <>
                      <span>·</span>
                      <span>Evento {format(eventDate, 'dd/MM/yy', { locale: ptBR })}</span>
                    </>
                  )}
                  {enr.deal?.pipeline_stage && (
                    <>
                      <span>·</span>
                      <span className="text-violet-600 dark:text-violet-400">
                        {enr.deal.pipeline_stage.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {enr.deal_id && (
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
