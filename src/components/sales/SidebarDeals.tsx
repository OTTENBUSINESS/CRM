import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Briefcase,
  MoreVertical,
  ExternalLink,
  Pencil,
  CreditCard,
  Trophy,
  XCircle,
  ArrowRightCircle,
  UserPlus,
  Plus,
  Sparkles,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deal } from '@/types/sales.types';

interface SidebarDealsProps {
  deals: Deal[];
  selectedDealId: string | null;
  pipelineStages?: Array<{ id: string; name: string; color: string | null; is_won?: boolean; is_lost?: boolean }>;
  onSelectDeal: (dealId: string) => void;
  onCreateDeal: () => void;
  onViewDeal: (deal: Deal) => void;
  onEditDeal: (deal: Deal) => void;
  onConfigurePayment: (deal: Deal) => void;
  onWinDeal: (deal: Deal) => void;
  onLoseDeal: (deal: Deal) => void;
  onTransferPipeline: (deal: Deal) => void;
  onAddContact: (dealId: string) => void;
  onDeleteDeal: (deal: Deal) => void;
  onReopenDeal: (deal: Deal, targetStageId: string) => void;
  onRefundDeal?: (deal: Deal) => void;
}

function formatCurrency(value: number) {
  if (!value) return 'R$ 0';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

export function SidebarDeals({
  deals,
  selectedDealId,
  pipelineStages,
  onSelectDeal,
  onCreateDeal,
  onViewDeal,
  onEditDeal,
  onConfigurePayment,
  onWinDeal,
  onLoseDeal,
  onTransferPipeline,
  onAddContact,
  onDeleteDeal,
  onReopenDeal,
  onRefundDeal,
}: SidebarDealsProps) {
  const [reopenDealId, setReopenDealId] = useState<string | null>(null);
  const reopenDeal = reopenDealId ? deals.find((d: any) => d.id === reopenDealId) : null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-blue-500" />
            Oportunidades ({deals.length})
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onCreateDeal}>
            <Plus className="h-3 w-3 mr-1" />
            Novo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {deals.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Briefcase className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
            <p className="text-[10px]">Nenhuma oportunidade</p>
            <Button variant="outline" size="sm" className="mt-1.5 h-6 text-[10px]" onClick={onCreateDeal}>
              <Plus className="h-3 w-3 mr-1" /> Criar deal
            </Button>
          </div>
        ) : (
          deals.map((deal: any) => {
            const isSelected = deal.id === selectedDealId;
            const pipelineName = deal.pipeline_stage?.pipeline?.name || deal.pipeline?.name || '';
            const stageName = deal.pipeline_stage?.name || 'Sem etapa';
            const stageColor = deal.pipeline_stage?.color || '#94a3b8';
            const value = Number(deal.negotiated_price) || 0;
            const isWon = deal.status === 'won';
            const isLost = deal.status === 'lost';
            const webinarTitle = deal.webinar_enrollment?.webinar_title;
            const utmSource = deal.lead?.utm_source;
            const productName = deal.product?.name;
            const salesRepName = deal.sales_rep?.name;

            const isWebinar = pipelineName.toLowerCase().includes('webinár') || pipelineName.toLowerCase().includes('webinar');
            const PipelineIcon = isWebinar ? Sparkles : Briefcase;
            const pipelineColor = isWebinar ? 'text-violet-500' : 'text-blue-500';

            const sourceMap: Record<string, string> = {
              facebook: 'FB', instagram: 'IG', ig: 'IG', google: 'GG',
              whatsapp: 'WA', organic: 'Org', direct: 'Dir',
            };
            const sourceShort = utmSource ? (sourceMap[utmSource.toLowerCase()] || utmSource) : null;

            return (
              <div
                key={deal.id}
                onClick={() => onSelectDeal(deal.id)}
                className={cn(
                  'relative rounded-lg border px-3 py-2 cursor-pointer transition-all group',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border/50 hover:border-border hover:bg-muted/30',
                  isWon && !isSelected && 'border-green-300 bg-green-50/30 dark:bg-green-950/20',
                  isLost && !isSelected && 'border-red-200 bg-red-50/20 dark:bg-red-950/20 opacity-70'
                )}
              >
                {isSelected && <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r" />}

                {/* Row 1: Pipeline · Stage · ••• */}
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <PipelineIcon className={cn('h-3 w-3 shrink-0', pipelineColor)} />
                    <span className="text-[10px] text-muted-foreground truncate">{pipelineName}</span>
                    <span className="text-[10px] text-muted-foreground/50">·</span>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
                    <span className={cn(
                      'text-[11px] font-semibold truncate',
                      isWon && 'text-green-700 dark:text-green-400',
                      isLost && 'text-red-600 dark:text-red-400'
                    )}>
                      {stageName}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewDeal(deal); }}><ExternalLink className="h-3.5 w-3.5 mr-2" />Ver detalhes</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditDeal(deal); }}><Pencil className="h-3.5 w-3.5 mr-2" />Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddContact(deal.id); }}><UserPlus className="h-3.5 w-3.5 mr-2" />Decisor</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onTransferPipeline(deal); }}><ArrowRightCircle className="h-3.5 w-3.5 mr-2" />Transferir</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {!isWon && !isLost && (
                        <>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onWinDeal(deal); }} className="text-green-600"><Trophy className="h-3.5 w-3.5 mr-2" />Ganho</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onLoseDeal(deal); }} className="text-red-600"><XCircle className="h-3.5 w-3.5 mr-2" />Perdido</DropdownMenuItem>
                        </>
                      )}
                      {isWon && onRefundDeal && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRefundDeal(deal); }} className="text-red-600"><RotateCcw className="h-3.5 w-3.5 mr-2" />Reembolso</DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDeleteDeal(deal); }} className="text-red-600"><Trash2 className="h-3.5 w-3.5 mr-2" />Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Row 2: Valor + Produto */}
                <div className="flex items-baseline gap-2">
                  <span className={cn(
                    'text-sm font-bold',
                    isWon ? 'text-green-700 dark:text-green-400' : 'text-foreground'
                  )}>
                    {formatCurrency(value)}
                  </span>
                  {productName && (
                    <span className="text-[10px] text-muted-foreground truncate">{productName}</span>
                  )}
                </div>

                {/* Row 3: Badges compactos (responsavel · origem · webinar) */}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px] text-muted-foreground">
                  {salesRepName && <span>{salesRepName}</span>}
                  {salesRepName && sourceShort && <span className="opacity-40">·</span>}
                  {sourceShort && (
                    <span className="px-1 py-0 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium text-[9px]">
                      {sourceShort}
                    </span>
                  )}
                  {webinarTitle && (
                    <span className="px-1 py-0 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-medium text-[9px] inline-flex items-center gap-0.5">
                      <Sparkles className="h-2 w-2" />{webinarTitle}
                    </span>
                  )}
                  {isWon && <span className="px-1 py-0 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-bold text-[9px]">GANHO</span>}
                  {isLost && <span className="px-1 py-0 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-bold text-[9px]">PERDIDO</span>}
                </div>

                {/* Botões de ação — Ganho/Perdido quando aberto, Reabrir quando fechado */}
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/30">
                  {!isWon && !isLost ? (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onWinDeal(deal); }}
                        className="flex-1 flex items-center justify-center gap-1 h-6 rounded text-[10px] font-semibold bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/30 dark:hover:bg-green-950/50 dark:text-green-400 dark:border-green-800 transition-colors"
                      >
                        <Trophy className="h-3 w-3" />
                        Ganho
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onLoseDeal(deal); }}
                        className="flex-1 flex items-center justify-center gap-1 h-6 rounded text-[10px] font-semibold bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 dark:bg-red-950/30 dark:hover:bg-red-950/50 dark:text-red-400 dark:border-red-800 transition-colors"
                      >
                        <XCircle className="h-3 w-3" />
                        Perdido
                      </button>
                    </>
                  ) : reopenDealId === deal.id ? (
                    /* Seletor de etapa pra reabrir */
                    <div className="w-full space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground">Mover para qual etapa?</p>
                      <div className="flex flex-wrap gap-1">
                        {(pipelineStages || []).filter(s => !s.is_won && !s.is_lost).map(stage => (
                          <button
                            key={stage.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onReopenDeal(deal, stage.id);
                              setReopenDealId(null);
                            }}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-border/50 hover:bg-muted/50 transition-colors"
                          >
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stage.color || '#94a3b8' }} />
                            {stage.name}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setReopenDealId(null); }}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReopenDealId(deal.id);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 h-6 rounded text-[10px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reabrir oportunidade
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
