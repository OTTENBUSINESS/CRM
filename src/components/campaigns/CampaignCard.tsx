import { Card, CardContent } from '@/components/ui/card';
import { Send, Users, MessageSquareReply, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Campaign } from '@/types/campaign.types';
import CampaignStatusBadge from './CampaignStatusBadge';
import CampaignProgressBar from './CampaignProgressBar';

interface Props {
  campaign: Campaign;
}

export default function CampaignCard({ campaign }: Props) {
  const navigate = useNavigate();
  const responseRate = campaign.sent_count > 0
    ? Math.round((campaign.responded_count / campaign.sent_count) * 100)
    : 0;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/comercial/campanhas/${campaign.id}`)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-sm">{campaign.name}</h3>
            {campaign.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{campaign.description}</p>
            )}
          </div>
          <CampaignStatusBadge status={campaign.status} />
        </div>

        {campaign.status === 'sending' && <CampaignProgressBar campaign={campaign} />}

        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Users className="h-3 w-3" />
            </div>
            <p className="text-sm font-semibold">{campaign.total_leads}</p>
            <p className="text-[10px] text-muted-foreground">Leads</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-sky-500">
              <Send className="h-3 w-3" />
            </div>
            <p className="text-sm font-semibold">{campaign.sent_count}</p>
            <p className="text-[10px] text-muted-foreground">Enviados</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-green-500">
              <MessageSquareReply className="h-3 w-3" />
            </div>
            <p className="text-sm font-semibold">{campaign.responded_count}</p>
            <p className="text-[10px] text-muted-foreground">Respostas</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-red-500">
              <AlertTriangle className="h-3 w-3" />
            </div>
            <p className="text-sm font-semibold">{campaign.blocked_count}</p>
            <p className="text-[10px] text-muted-foreground">Bloqueios</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {campaign.created_by_member?.name && `por ${campaign.created_by_member.name}`}
          </span>
          <span>
            {responseRate > 0 && `${responseRate}% resposta`}
            {' · '}
            {new Date(campaign.created_at).toLocaleDateString('pt-BR')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
