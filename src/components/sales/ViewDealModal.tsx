import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import { useDealPayments, useDeleteDealPayment } from "@/hooks/useDealPayments";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CloseDealModal } from "./CloseDealModal";
import { PaymentPartCard } from "./payments/PaymentPartCard";
import { DealContactsTab } from "./DealContactsTab";
import { TransferPipelineModal } from "./TransferPipelineModal";
import type { Deal } from "@/types/sales.types";
import {
  User,
  Users,
  Package,
  DollarSign,
  Calendar,
  TrendingUp,
  CreditCard,
  FileText,
  ExternalLink,
  Trophy,
  XCircle,
  Pencil,
  Check,
  X,
  GitBranch,
  UserPlus,
  HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getStatusBadge(status: string) {
  switch (status) {
    case "won":
      return <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">Ganho</Badge>;
    case "lost":
      return <Badge className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">Perdido</Badge>;
    case "negotiation":
      return <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">Negociando</Badge>;
    case "proposal_sent":
      return <Badge className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">Proposta Enviada</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}


export function ViewDealModal({ open, onOpenChange, deal }: ViewDealModalProps) {
  const navigate = useNavigate();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isResponsavelOpen, setIsResponsavelOpen] = useState(false);
  const [isSdrOpen, setIsSdrOpen] = useState(false);
  const [showCommitmentInput, setShowCommitmentInput] = useState(false);
  const [commitmentValue, setCommitmentValue] = useState('');

  const { data: payments, isLoading: loadingPayments } = useDealPayments(deal?.id || "");
  const { data: teamMembers } = useTeamMembers();
  const deletePayment = useDeleteDealPayment();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleAssignDealResponsavel = async (memberId: string | null) => {
    if (!deal) return;
    try {
      const { error } = await supabase
        .from('deals')
        .update({ sales_rep_id: memberId, updated_at: new Date().toISOString() })
        .eq('id', deal.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-deal', deal.id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });

      const memberName = memberId
        ? teamMembers?.find(m => m.id === memberId)?.name
        : null;

      toast({
        title: memberId ? 'Responsável atribuído' : 'Responsável removido',
        description: memberName ? `${memberName} é agora o responsável` : 'Deal sem responsável',
      });
      setIsResponsavelOpen(false);
    } catch (err) {
      console.error('Error assigning deal responsavel:', err);
      toast({ title: 'Erro ao atribuir responsável', variant: 'destructive' });
    }
  };

  const handleAssignDealSdr = async (memberId: string | null) => {
    if (!deal) return;
    try {
      const { error } = await supabase
        .from('deals')
        .update({ sdr_id: memberId, updated_at: new Date().toISOString() })
        .eq('id', deal.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-deal', deal.id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });

      const memberName = memberId
        ? teamMembers?.find(m => m.id === memberId)?.name
        : null;

      toast({
        title: memberId ? 'SDR atribuído' : 'SDR removido',
        description: memberName ? `${memberName} é agora o SDR` : 'Deal sem SDR',
      });
      setIsSdrOpen(false);
    } catch (err) {
      console.error('Error assigning deal SDR:', err);
      toast({ title: 'Erro ao atribuir SDR', variant: 'destructive' });
    }
  };

  const EM_FECHAMENTO_STAGE_ID = '11111111-0001-0001-0001-000000000007';

  const handleRegisterCommitment = async () => {
    if (!deal) return;
    const amount = parseFloat(commitmentValue.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!amount || amount <= 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' });
      return;
    }
    try {
      const updateData: Record<string, unknown> = {
        commitment_amount: amount,
        commitment_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Auto-move to "Em Fechamento" if not already won/lost
      if (deal.status !== 'won' && deal.status !== 'lost') {
        updateData.pipeline_stage_id = EM_FECHAMENTO_STAGE_ID;
      }

      const { error } = await supabase
        .from('deals')
        .update(updateData)
        .eq('id', deal.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-deal', deal.id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });

      toast({
        title: 'Sinal registrado!',
        description: `Sinal de R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} registrado. Deal movido para Em Fechamento.`,
      });
      setShowCommitmentInput(false);
      setCommitmentValue('');
    } catch (err) {
      console.error('Error registering commitment:', err);
      toast({ title: 'Erro ao registrar sinal', variant: 'destructive' });
    }
  };

  const handleRemoveCommitment = async () => {
    if (!deal) return;
    try {
      const { error } = await supabase
        .from('deals')
        .update({ commitment_amount: 0, commitment_date: null, updated_at: new Date().toISOString() })
        .eq('id', deal.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-deal', deal.id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });

      toast({ title: 'Sinal removido' });
    } catch (err) {
      console.error('Error removing commitment:', err);
      toast({ title: 'Erro ao remover sinal', variant: 'destructive' });
    }
  };

  const leadOrContact = deal?.lead || deal?.contact;
  const contactName = leadOrContact?.name || "Sem contato";
  const productName = deal?.product?.name || "Sem produto";
  const hasDiscount = deal?.discount_percent && deal.discount_percent > 0;

  const handleGoToLead = () => {
    onOpenChange(false);
    if (deal.lead_id) {
      navigate(`/comercial/leads/${deal.lead_id}`);
    } else if (deal.contact_id) {
      navigate(`/clientes/${deal.contact_id}`);
    }
  };

  const totalPaid = payments?.reduce((sum, p) => {
    if (p.status === "received" || p.status === "confirmed") {
      return sum + Number(p.amount);
    }
    return sum;
  }, 0) || 0;

  const totalPending = (deal?.negotiated_price || 0) - totalPaid;

  if (!deal) {
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><div /></DialogContent></Dialog>;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { document.body.style.removeProperty('pointer-events'); setTimeout(() => { document.body.style.removeProperty('pointer-events'); }, 150); setTimeout(() => { document.body.style.removeProperty('pointer-events'); }, 400); } }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden" onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.removeProperty('pointer-events'); }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Detalhes do Deal
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
            <div className="space-y-6">
              {/* Header com contato e status */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={leadOrContact?.avatar_url} />
                    <AvatarFallback className="bg-primary/10 text-lg">
                      {getInitials(contactName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-lg">{contactName}</h3>
                    <p className="text-sm text-muted-foreground">
                      {leadOrContact?.email || leadOrContact?.phone || "Sem contato"}
                    </p>
                    <Button
                      variant="link"
                      className="p-0 h-auto text-xs text-primary"
                      onClick={handleGoToLead}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Ver perfil do lead
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getStatusBadge(deal.status)}
                  {deal.pipeline_stage && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        deal.pipeline_stage.color === 'green' && "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300",
                        deal.pipeline_stage.color === 'red' && "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
                        deal.pipeline_stage.color === 'blue' && "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
                        deal.pipeline_stage.color === 'purple' && "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
                        deal.pipeline_stage.color === 'orange' && "border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
                        deal.pipeline_stage.color === 'cyan' && "border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300",
                        deal.pipeline_stage.color === 'indigo' && "border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300",
                        deal.pipeline_stage.color === 'amber' && "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {deal.pipeline_stage.name}
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              {/* Cards de resumo */}
              <div className="grid grid-cols-2 gap-4">
                {/* Card Responsável */}
                <Card className={cn(!deal.sales_rep && "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30")}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <User className="h-4 w-4" />
                      <span className="text-xs">Responsável</span>
                    </div>
                    <Popover open={isResponsavelOpen} onOpenChange={setIsResponsavelOpen}>
                      <PopoverTrigger asChild>
                        <button className={cn(
                          "flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors -mx-2",
                          !deal.sales_rep && "text-amber-600 dark:text-amber-400 dark:text-amber-400"
                        )}>
                          <span className="font-semibold flex-1">
                            {deal.sales_rep?.name || "Sem responsável"}
                          </span>
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="start" side="bottom">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground px-2 py-1">
                            Atribuir responsável
                          </p>
                          {teamMembers?.map((member) => (
                            <button
                              key={member.id}
                              onClick={() => handleAssignDealResponsavel(member.id)}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left",
                                deal.sales_rep_id === member.id && "bg-blue-50 dark:bg-blue-950/30 font-medium text-blue-700 dark:text-blue-300"
                              )}
                            >
                              <Avatar className="h-7 w-7 border">
                                <AvatarFallback className="text-xs bg-muted font-medium">
                                  {member.name?.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span>{member.name}</span>
                              {deal.sales_rep_id === member.id && (
                                <Check className="h-4 w-4 ml-auto text-blue-600" />
                              )}
                            </button>
                          ))}
                          {deal.sales_rep && (
                            <>
                              <div className="border-t my-1" />
                              <button
                                onClick={() => handleAssignDealResponsavel(null)}
                                className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors font-medium"
                              >
                                <X className="h-4 w-4" />
                                Remover responsável
                              </button>
                            </>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </CardContent>
                </Card>

                {/* Card SDR */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <UserPlus className="h-4 w-4" />
                      <span className="text-xs">SDR (Agendou)</span>
                    </div>
                    <Popover open={isSdrOpen} onOpenChange={setIsSdrOpen}>
                      <PopoverTrigger asChild>
                        <button className={cn(
                          "flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors -mx-2",
                          !deal.sdr && "text-muted-foreground"
                        )}>
                          <span className="font-semibold flex-1">
                            {deal.sdr?.name || "Sem SDR"}
                          </span>
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="start" side="bottom">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground px-2 py-1">
                            Atribuir SDR
                          </p>
                          {teamMembers?.map((member) => (
                            <button
                              key={member.id}
                              onClick={() => handleAssignDealSdr(member.id)}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left",
                                deal.sdr_id === member.id && "bg-blue-50 dark:bg-blue-950/30 font-medium text-blue-700 dark:text-blue-300"
                              )}
                            >
                              <Avatar className="h-7 w-7 border">
                                <AvatarFallback className="text-xs bg-muted font-medium">
                                  {member.name?.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span>{member.name}</span>
                              {deal.sdr_id === member.id && (
                                <Check className="h-4 w-4 ml-auto text-blue-600" />
                              )}
                            </button>
                          ))}
                          {deal.sdr && (
                            <>
                              <div className="border-t my-1" />
                              <button
                                onClick={() => handleAssignDealSdr(null)}
                                className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors font-medium"
                              >
                                <X className="h-4 w-4" />
                                Remover SDR
                              </button>
                            </>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Package className="h-4 w-4" />
                      <span className="text-xs">Produto</span>
                    </div>
                    <p className="font-semibold">{productName}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-xs">Valor Negociado</span>
                    </div>
                    <p className="font-bold text-lg text-primary">
                      {formatCurrency(deal.negotiated_price)}
                    </p>
                    {hasDiscount && (
                      <p className="text-xs text-muted-foreground">
                        <span className="line-through">{formatCurrency(deal.original_price)}</span>
                        <Badge variant="outline" className="ml-2 text-emerald-600 dark:text-emerald-400 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                          -{deal.discount_percent}%
                        </Badge>
                      </p>
                    )}
                  </CardContent>
                </Card>

                {deal.ai_win_probability > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs">Probabilidade IA</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-bold text-lg",
                          deal.ai_win_probability >= 70 ? "text-emerald-600 dark:text-emerald-400" :
                          deal.ai_win_probability >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                        )}>
                          {deal.ai_win_probability}%
                        </span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              deal.ai_win_probability >= 70 ? "bg-emerald-500" :
                              deal.ai_win_probability >= 40 ? "bg-amber-500" : "bg-red-500"
                            )}
                            style={{ width: `${deal.ai_win_probability}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {deal.expected_close_date && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Calendar className="h-4 w-4" />
                        <span className="text-xs">Previsão de Fechamento</span>
                      </div>
                      <p className="font-semibold">
                        {new Date(deal.expected_close_date).toLocaleDateString("pt-BR")}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sinal de compromisso */}
              {deal.status !== 'won' && deal.status !== 'lost' && (
                <div className="space-y-2">
                  {(deal.commitment_amount ?? 0) > 0 ? (
                    <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <HandCoins className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                            Sinal de {formatCurrency(deal.commitment_amount!)}
                          </p>
                          {deal.commitment_date && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              Registrado em {new Date(deal.commitment_date).toLocaleDateString('pt-BR')}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveCommitment}
                        className="text-red-500 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 h-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : showCommitmentInput ? (
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                      <HandCoins className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                      <Input
                        placeholder="Valor do sinal (ex: 1000)"
                        value={commitmentValue}
                        onChange={(e) => setCommitmentValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRegisterCommitment()}
                        className="h-8"
                        autoFocus
                      />
                      <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={handleRegisterCommitment}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowCommitmentInput(false); setCommitmentValue(''); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      onClick={() => setShowCommitmentInput(true)}
                    >
                      <HandCoins className="h-4 w-4 mr-2" />
                      Registrar Sinal de Compromisso
                    </Button>
                  )}
                </div>
              )}

              {/* Tabs para pagamentos, contatos e notas */}
              <Tabs defaultValue="payments" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="payments">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pagamentos
                  </TabsTrigger>
                  <TabsTrigger value="contacts">
                    <Users className="h-4 w-4 mr-2" />
                    Contatos
                  </TabsTrigger>
                  <TabsTrigger value="notes">
                    <FileText className="h-4 w-4 mr-2" />
                    Observações
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="payments" className="space-y-4 mt-4">
                  {/* Resumo financeiro */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-bold">{formatCurrency(deal.negotiated_price)}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg text-center">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">Pago</p>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalPaid)}</p>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-center">
                      <p className="text-xs text-amber-600 dark:text-amber-400">Pendente</p>
                      <p className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(totalPending)}</p>
                    </div>
                  </div>

                  {/* Lista de pagamentos */}
                  {loadingPayments ? (
                    <div className="text-center py-4 text-muted-foreground">
                      Carregando pagamentos...
                    </div>
                  ) : payments && payments.length > 0 ? (
                    <div className="space-y-3">
                      {payments.map((payment) => (
                        <PaymentPartCard
                          key={payment.id}
                          payment={payment}
                          onDelete={
                            payment.status === "pending"
                              ? () => deletePayment.mutate({ id: payment.id, dealId: deal.id })
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhum pagamento registrado</p>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowPaymentModal(true)}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    {payments && payments.length > 0 ? "Adicionar Pagamento" : "Configurar Pagamentos"}
                  </Button>
                </TabsContent>

                <TabsContent value="contacts" className="mt-4">
                  <DealContactsTab dealId={deal.id} primaryLeadId={deal.lead_id} />
                </TabsContent>

                <TabsContent value="notes" className="mt-4">
                  <div className="min-h-[100px] p-4 border rounded-lg bg-muted/30">
                    {deal.notes ? (
                      <p className="text-sm whitespace-pre-wrap">{deal.notes}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma observação registrada
                      </p>
                    )}
                  </div>

                  {deal.lost_reason && (
                    <div className="mt-4 p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/30">
                      <p className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Motivo da Perda
                      </p>
                      <p className="text-sm text-red-600 mt-1">{deal.lost_reason}</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Transferir pipeline */}
              {deal.status !== 'won' && deal.status !== 'lost' && (
                <Button
                  variant="outline"
                  className="w-full text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                  onClick={() => setShowTransferModal(true)}
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  Transferir de Pipeline
                </Button>
              )}

              {/* Datas */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t">
                <span>Criado em: {new Date(deal.created_at).toLocaleString("pt-BR")}</span>
                {deal.won_at && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    <Trophy className="h-3 w-3 inline mr-1" />
                    Ganho em: {new Date(deal.won_at).toLocaleString("pt-BR")}
                  </span>
                )}
                {deal.lost_at && (
                  <span className="text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3 inline mr-1" />
                    Perdido em: {new Date(deal.lost_at).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Modal de pagamentos */}
      {showPaymentModal && (
        <CloseDealModal
          open={showPaymentModal}
          onOpenChange={setShowPaymentModal}
          deal={deal}
          leadCpfCnpj={leadOrContact?.cpf_cnpj}
        />
      )}

      {/* Modal de transferência de pipeline */}
      <TransferPipelineModal
        open={showTransferModal}
        onOpenChange={setShowTransferModal}
        deal={deal}
      />
    </>
  );
}
