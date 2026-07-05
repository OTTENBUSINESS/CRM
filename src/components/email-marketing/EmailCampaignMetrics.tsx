import { Card, CardContent } from '@/components/ui/card';
import { Mail, Eye, MousePointerClick, AlertTriangle, UserMinus, Send } from 'lucide-react';
import type { EmailCampaign } from '@/types/email.types';

interface Props {
  campaign: EmailCampaign;
}

export default function EmailCampaignMetrics({ campaign }: Props) {
  const delivered = campaign.delivered_count || 0;
  const openRate = delivered > 0 ? Math.round((campaign.opened_count / delivered) * 100) : 0;
  const clickRate = delivered > 0 ? Math.round((campaign.clicked_count / delivered) * 100) : 0;
  const bounceRate = campaign.sent_count > 0 ? Math.round((campaign.bounced_count / campaign.sent_count) * 100) : 0;

  const metrics = [
    { label: 'Enviados', value: campaign.sent_count, icon: Send, color: 'text-blue-600' },
    { label: 'Entregues', value: delivered, icon: Mail, color: 'text-teal-600' },
    { label: 'Abertos', value: `${campaign.opened_count} (${openRate}%)`, icon: Eye, color: 'text-indigo-600' },
    { label: 'Cliques', value: `${campaign.clicked_count} (${clickRate}%)`, icon: MousePointerClick, color: 'text-purple-600' },
    { label: 'Bounces', value: `${campaign.bounced_count} (${bounceRate}%)`, icon: AlertTriangle, color: 'text-red-600' },
    { label: 'Descadastros', value: campaign.unsubscribed_count, icon: UserMinus, color: 'text-orange-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {metrics.map(m => (
        <Card key={m.label}>
          <CardContent className="p-3 text-center">
            <m.icon className={`h-5 w-5 mx-auto mb-1 ${m.color}`} />
            <p className="text-lg font-bold">{m.value}</p>
            <p className="text-[10px] text-muted-foreground">{m.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
