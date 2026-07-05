import type { Campaign } from '@/types/campaign.types';

interface CampaignProgressBarProps {
  campaign: Campaign;
}

export default function CampaignProgressBar({ campaign }: CampaignProgressBarProps) {
  const processed =
    campaign.sent_count +
    campaign.delivered_count +
    campaign.read_count +
    campaign.responded_count +
    campaign.failed_count +
    campaign.blocked_count;

  const total = campaign.total_leads || 1;
  const percentage = Math.min(100, Math.round((processed / total) * 100));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{percentage}%</span>
        <span className="text-muted-foreground">
          {processed} / {campaign.total_leads} leads
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
