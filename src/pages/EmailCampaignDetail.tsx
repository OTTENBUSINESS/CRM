import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';
import { useEmailCampaign } from '@/hooks/useEmailMarketing';
import { EMAIL_CAMPAIGN_STATUS_CONFIG } from '@/types/email.types';
import EmailCampaignMetrics from '@/components/email-marketing/EmailCampaignMetrics';
import EmailCampaignLeadsTable from '@/components/email-marketing/EmailCampaignLeadsTable';
import { AppLayout } from '@/components/layout/AppLayout';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function EmailCampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: campaign, isLoading, isError } = useEmailCampaign(id);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !campaign) {
    return (
      <AppLayout>
        <div className="p-6 max-w-7xl mx-auto">
          <Button variant="ghost" size="sm" onClick={() => navigate('/marketing/campanhas')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Campanhas
          </Button>
          <div className="text-center py-20">
            <Mail className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <h3 className="mt-4 text-lg font-medium">Campanha não encontrada</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Ela pode ter sido removida ou o link está errado.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const statusCfg = EMAIL_CAMPAIGN_STATUS_CONFIG[campaign.status];

  return (
    <AppLayout>
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/marketing/campanhas')} className="mb-3">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Campanhas
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-primary shrink-0" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold leading-tight">{campaign.name}</h1>
                <Badge className={`${statusCfg.bgColor} ${statusCfg.color}`}>{statusCfg.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{campaign.subject}</p>
            </div>
          </div>
        </div>

        {/* Meta rápida */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-3">
          <span>
            De: {campaign.from_name} &lt;{campaign.from_email}&gt;
          </span>
          {campaign.template?.name && (
            <>
              <span>·</span>
              <span>Template: {campaign.template.name}</span>
            </>
          )}
          {campaign.started_at && (
            <>
              <span>·</span>
              <span>
                Iniciada em {format(new Date(campaign.started_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
              </span>
            </>
          )}
          {campaign.scheduled_at && !campaign.started_at && (
            <>
              <span>·</span>
              <span>
                Agendada para{' '}
                {format(new Date(campaign.scheduled_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Métricas */}
      <EmailCampaignMetrics campaign={campaign} />

      {/* Tabela de leads */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Leads da campanha</h2>
        <EmailCampaignLeadsTable campaignId={campaign.id} campaignStatus={campaign.status} />
      </div>
    </div>
    </AppLayout>
  );
}
