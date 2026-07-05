import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import CampaignDetailPanel from '@/components/campaigns/CampaignDetailPanel';
import CampaignLeadsTable from '@/components/campaigns/CampaignLeadsTable';
import { AppLayout } from '@/components/layout/AppLayout';
import type { Campaign } from '@/types/campaign.types';

export default function SalesCampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns' as any)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as Campaign;
    },
  });

  return (
    <AppLayout>
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/comercial/campanhas')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Detalhes da campanha</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : campaign ? (
        <>
          <CampaignDetailPanel campaign={campaign} />
          <CampaignLeadsTable campaignId={campaign.id} campaignStatus={campaign.status} />
        </>
      ) : (
        <div className="text-center py-20">
          <Megaphone className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <h3 className="mt-4 text-lg font-medium">Campanha não encontrada</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Ela pode ter sido removida ou o link está incorreto.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => navigate('/comercial/campanhas')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para campanhas
          </Button>
        </div>
      )}
    </div>
    </AppLayout>
  );
}
