import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, Smartphone, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import CampaignCard from '@/components/campaigns/CampaignCard';
import CampaignMetricsDashboard from '@/components/campaigns/CampaignMetricsDashboard';
import CampaignInstancesManager from '@/components/campaigns/CampaignInstancesManager';
import { AppLayout } from '@/components/layout/AppLayout';
import type { Campaign } from '@/types/campaign.types';

type Tab = 'campaigns' | 'instances';

export default function SalesCampaigns() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('campaigns');

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Campaign[];
    },
  });

  return (
    <AppLayout>
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Campanhas</h1>
            <p className="text-sm text-muted-foreground">
              Disparos em massa via WhatsApp para sua base de leads
            </p>
          </div>
        </div>
        {activeTab === 'campaigns' && (
          <Button onClick={() => navigate('/comercial/campanhas/nova')}>
            <Plus className="h-4 w-4 mr-2" />
            Nova campanha
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/50">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'campaigns'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Megaphone className="h-4 w-4 inline mr-1.5" />
          Campanhas
        </button>
        <button
          onClick={() => setActiveTab('instances')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'instances'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Smartphone className="h-4 w-4 inline mr-1.5" />
          Instâncias
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'instances' ? (
        <CampaignInstancesManager />
      ) : (
        <>
          {/* Métricas */}
          <CampaignMetricsDashboard />

          {/* Lista de campanhas */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns && campaigns.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map(campaign => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Megaphone className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <h3 className="mt-4 text-lg font-medium">Nenhuma campanha ainda</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Crie sua primeira campanha para disparar mensagens em massa.
              </p>
              <Button className="mt-4" onClick={() => navigate('/comercial/campanhas/nova')}>
                <Plus className="h-4 w-4 mr-2" />
                Nova campanha
              </Button>
            </div>
          )}
        </>
      )}
    </div>
    </AppLayout>
  );
}
