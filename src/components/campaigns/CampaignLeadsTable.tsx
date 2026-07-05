import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignLeadStatus } from '@/types/campaign.types';
import { CAMPAIGN_LEAD_STATUS_CONFIG } from '@/types/campaign.types';
import { useCampaignLeads } from '@/hooks/useCampaigns';

interface Props {
  campaignId: string;
  campaignStatus?: string;
}

const PAGE_SIZE = 50;

export default function CampaignLeadsTable({ campaignId, campaignStatus }: Props) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<CampaignLeadStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const [errorDetail, setErrorDetail] = useState<{ name: string; error: string } | null>(null);

  const { data, isLoading } = useCampaignLeads(
    campaignId,
    statusFilter === 'all' ? undefined : statusFilter,
    page,
    PAGE_SIZE,
    campaignStatus
  );

  const leads = data?.leads || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(0); }}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(CAMPAIGN_LEAD_STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{total} leads</span>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{page + 1}/{totalPages}</span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Nome</TableHead>
                <TableHead className="text-xs">Telefone</TableHead>
                <TableHead className="text-xs">Cidade</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Enviado em</TableHead>
                <TableHead className="text-xs">Respondeu em</TableHead>
                <TableHead className="text-xs">Atribuído a</TableHead>
                <TableHead className="text-xs w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map(cl => {
                const statusCfg = CAMPAIGN_LEAD_STATUS_CONFIG[cl.status];
                const hasError = cl.status === 'failed' || cl.status === 'blocked';

                return (
                  <TableRow
                    key={cl.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      if (cl.lead_id) navigate(`/comercial/leads/${cl.lead_id}`);
                    }}
                  >
                    <TableCell className="text-xs font-medium">{cl.lead?.name || '—'}</TableCell>
                    <TableCell className="text-xs">{cl.lead?.phone || '—'}</TableCell>
                    <TableCell className="text-xs">{cl.lead?.city_name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[10px]', statusCfg?.color, statusCfg?.bgColor)}>
                        {statusCfg?.label || cl.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {cl.sent_at ? new Date(cl.sent_at).toLocaleString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {cl.responded_at ? new Date(cl.responded_at).toLocaleString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{cl.assigned_member?.name || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {hasError && cl.error_message && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Ver detalhes do erro"
                          onClick={(e) => {
                            e.stopPropagation();
                            setErrorDetail({
                              name: cl.lead?.name || 'Lead',
                              error: cl.error_message!,
                            });
                          }}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      )}
                      {cl.lead_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Abrir lead"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/comercial/leads/${cl.lead_id}`);
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {leads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                    Nenhum lead encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Error Detail Dialog */}
      <Dialog open={!!errorDetail} onOpenChange={(open) => !open && setErrorDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Erro no envio
            </DialogTitle>
            <DialogDescription>{errorDetail?.name}</DialogDescription>
          </DialogHeader>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <pre className="text-xs text-red-800 whitespace-pre-wrap break-all font-mono">
              {errorDetail?.error}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
