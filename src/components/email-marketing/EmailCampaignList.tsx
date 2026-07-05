import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Mail, Users, MousePointerClick, Eye, Pencil } from 'lucide-react';
import { useEmailCampaigns } from '@/hooks/useEmailMarketing';
import { EMAIL_CAMPAIGN_STATUS_CONFIG } from '@/types/email.types';
import type { EmailCampaignStatus } from '@/types/email.types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  onNewCampaign: () => void;
  onEditCampaign?: (id: string) => void;
}

export default function EmailCampaignList({ onNewCampaign, onEditCampaign }: Props) {
  const [statusFilter, setStatusFilter] = useState<EmailCampaignStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const { data: campaigns, isLoading } = useEmailCampaigns(
    statusFilter === 'all' ? undefined : statusFilter
  );

  const filtered = (campaigns || []).filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.subject.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar campanhas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(EMAIL_CAMPAIGN_STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhuma campanha encontrada</p>
            <Button variant="outline" className="mt-4" onClick={onNewCampaign}>
              <Plus className="h-4 w-4 mr-1" /> Criar campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(campaign => {
            const statusCfg = EMAIL_CAMPAIGN_STATUS_CONFIG[campaign.status];
            const openRate = campaign.delivered_count > 0 ? Math.round((campaign.opened_count / campaign.delivered_count) * 100) : 0;
            const clickRate = campaign.delivered_count > 0 ? Math.round((campaign.clicked_count / campaign.delivered_count) * 100) : 0;
            const editable = campaign.status === 'draft' || campaign.status === 'scheduled';
            const handleClick = () => {
              if (editable && onEditCampaign) onEditCampaign(campaign.id);
              else navigate(`/marketing/campanhas/${campaign.id}`);
            };

            return (
              <Card
                key={campaign.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={handleClick}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-sm truncate">{campaign.name}</h3>
                        <Badge className={`${statusCfg.bgColor} ${statusCfg.color} text-[10px]`}>{statusCfg.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{campaign.subject}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {campaign.total_leads}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {campaign.sent_count} enviados
                        </span>
                        {campaign.sent_count > 0 && (
                          <>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" /> {openRate}% abertos
                            </span>
                            <span className="flex items-center gap-1">
                              <MousePointerClick className="h-3 w-3" /> {clickRate}% cliques
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      {editable && onEditCampaign && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={(e) => { e.stopPropagation(); onEditCampaign(campaign.id); }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                      )}
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(campaign.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
