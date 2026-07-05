import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CampaignStatus } from '@/types/campaign.types';
import { CAMPAIGN_STATUS_CONFIG } from '@/types/campaign.types';

interface CampaignStatusBadgeProps {
  status: CampaignStatus;
  className?: string;
}

export default function CampaignStatusBadge({ status, className }: CampaignStatusBadgeProps) {
  const config = CAMPAIGN_STATUS_CONFIG[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent font-medium',
        config.bgColor,
        config.color,
        status === 'sending' && 'animate-pulse',
        className,
      )}
    >
      {config.label}
    </Badge>
  );
}
