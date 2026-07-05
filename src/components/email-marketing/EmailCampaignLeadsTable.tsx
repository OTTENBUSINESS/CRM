import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useEmailCampaignLeads } from '@/hooks/useEmailMarketing';
import { EMAIL_LEAD_STATUS_CONFIG } from '@/types/email.types';
import type { EmailCampaignLeadStatus } from '@/types/email.types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  campaignId: string;
  campaignStatus?: string;
}

export default function EmailCampaignLeadsTable({ campaignId, campaignStatus }: Props) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<EmailCampaignLeadStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data, isLoading } = useEmailCampaignLeads(
    campaignId,
    statusFilter === 'all' ? undefined : statusFilter,
    page,
    pageSize,
    campaignStatus,
  );

  const leads = data?.leads || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(0); }}>
          <SelectTrigger className="w-40 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({total})</SelectItem>
            {Object.entries(EMAIL_LEAD_STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Pagina {page + 1} de {totalPages || 1}</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Lead</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Enviado</TableHead>
                <TableHead className="text-xs">Aberto</TableHead>
                <TableHead className="text-xs">Clicou</TableHead>
                <TableHead className="text-xs w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map(cl => {
                const statusCfg = EMAIL_LEAD_STATUS_CONFIG[cl.status];
                const leadId = cl.lead?.id || cl.lead_id;
                const goToLead = () => leadId && navigate(`/comercial/leads/${leadId}`);
                return (
                  <TableRow
                    key={cl.id}
                    className={leadId ? 'cursor-pointer hover:bg-accent/40 transition-colors' : ''}
                    onClick={leadId ? goToLead : undefined}
                  >
                    <TableCell className="text-xs font-medium">
                      <span className={leadId ? 'hover:underline' : ''}>
                        {cl.lead?.name || cl.name || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{cl.email}</TableCell>
                    <TableCell>
                      <Badge className={`${statusCfg.bgColor} ${statusCfg.color} text-[10px]`}>{statusCfg.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {cl.sent_at ? format(new Date(cl.sent_at), 'dd/MM HH:mm', { locale: ptBR }) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {cl.opened_at ? format(new Date(cl.opened_at), 'dd/MM HH:mm', { locale: ptBR }) : '-'}
                      {cl.open_count > 1 && <span className="ml-1 text-[10px]">({cl.open_count}x)</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {cl.clicked_at ? format(new Date(cl.clicked_at), 'dd/MM HH:mm', { locale: ptBR }) : '-'}
                      {cl.click_count > 1 && <span className="ml-1 text-[10px]">({cl.click_count}x)</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {leadId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Abrir lead"
                          onClick={(e) => { e.stopPropagation(); goToLead(); }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {leads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum lead</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
