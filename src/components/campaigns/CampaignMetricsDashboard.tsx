import { Card, CardContent } from '@/components/ui/card';
import { Megaphone, Radio, Users, MessageSquareReply, BarChart3, Ban } from 'lucide-react';
import { useCampaignMetrics } from '@/hooks/useCampaigns';

export default function CampaignMetricsDashboard() {
  const { data: metrics } = useCampaignMetrics();

  if (!metrics) return null;

  const cards = [
    { label: 'Total Campanhas', value: metrics.total_campaigns, icon: Megaphone, color: 'text-purple-500' },
    { label: 'Ativas', value: metrics.active_campaigns, icon: Radio, color: 'text-amber-500' },
    { label: 'Leads Contactados', value: metrics.total_leads_contacted, icon: Users, color: 'text-sky-500' },
    { label: 'Responderam', value: metrics.total_responded, icon: MessageSquareReply, color: 'text-green-500' },
    { label: 'Taxa Resposta Média', value: `${metrics.avg_response_rate}%`, icon: BarChart3, color: 'text-indigo-500' },
    { label: 'Bloqueados', value: metrics.total_blocked, icon: Ban, color: 'text-red-500' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <Card key={c.label}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <c.icon className={`h-4 w-4 ${c.color}`} />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
            <p className="text-xl font-bold mt-1">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
