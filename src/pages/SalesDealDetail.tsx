import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { RegisterNegotiationModal, WinDealModal, DealOriginCard } from "@/components/sales";
import { useSalesDeal } from "@/hooks/useSalesDeals";
import { useDealPayments } from "@/hooks/useDealPayments";
import { useToast } from "@/hooks/use-toast";

import {
  ArrowLeft,
  Briefcase,
  Phone,
  MessageSquare,
  CreditCard,
  Trophy,
  XCircle,
  MoreHorizontal,
  Calendar,
  User,
  Package,
  DollarSign,
  Clock,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn, navigateTo } from "@/lib/utils";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string) {
  return name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";
}

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  link_generated: { label: "Link Gerado", color: "bg-blue-100 text-blue-700", icon: ExternalLink },
  confirmed: { label: "Confirmado", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  received: { label: "Recebido", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  overdue: { label: "Atrasado", color: "bg-red-100 text-red-700", icon: AlertCircle },
  refunded: { label: "Estornado", color: "bg-gray-100 text-gray-700", icon: XCircle },
  cancelled: { label: "Cancelado", color: "bg-gray-100 text-gray-700", icon: XCircle },
};

const SalesDealDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: deal, isLoading: dealLoading } = useSalesDeal(id);
  const { data: payments, isLoading: paymentsLoading } = useDealPayments(id || "");

  const [isPaymentConfigOpen, setIsPaymentConfigOpen] = useState(false);
  const [isWinDealOpen, setIsWinDealOpen] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Link copiado!" });
  };

  // Loading state
  if (dealLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppLayout>
    );
  }

  // Not found state
  if (!deal) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <Briefcase className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Deal nao encontrado</h2>
          <p className="text-muted-foreground mb-4">O deal que voce procura nao existe.</p>
          <Button onClick={() => navigate("/comercial/deals")}>Voltar para Deals</Button>
        </div>
      </AppLayout>
    );
  }

  const leadOrContact = deal.lead || deal.contact;
  const hasPayments = payments && payments.length > 0;
  const hasLinks = payments?.some((p) => p.payment_link);
  const totalPaid = payments?.filter((p) => p.status === "received" || p.status === "confirmed")
    .reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const totalPending = payments?.filter((p) => p.status === "pending" || p.status === "link_generated")
    .reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        {/* Header Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              {/* Lead Info */}
              <div className="flex items-center gap-4 flex-1">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={leadOrContact?.avatar_url} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                    {getInitials(leadOrContact?.name || "?")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="text-xl font-bold">{leadOrContact?.name || "Cliente"}</h1>
                  <p className="text-muted-foreground">{deal.product?.name || "Sem produto"}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        deal.status === "won" && "bg-green-100 text-green-700 border-green-200",
                        deal.status === "lost" && "bg-red-100 text-red-700 border-red-200",
                        deal.status === "negotiation" && "bg-blue-100 text-blue-700 border-blue-200",
                        deal.status === "proposal_sent" && "bg-purple-100 text-purple-700 border-purple-200"
                      )}
                    >
                      {deal.status === "won" && "Ganho"}
                      {deal.status === "lost" && "Perdido"}
                      {deal.status === "negotiation" && "Em Negociacao"}
                      {deal.status === "proposal_sent" && "Proposta Enviada"}
                    </Badge>
                    {deal.pipeline_stage && (
                      <Badge variant="secondary">{deal.pipeline_stage.name}</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Value and Actions */}
              <div className="flex flex-col items-end gap-3">
                <div className="text-right">
                  <p className="text-3xl font-bold text-primary">
                    {formatCurrency(Number(deal.negotiated_price) || 0)}
                  </p>
                  {deal.discount_percent && deal.discount_percent > 0 && (
                    <p className="text-sm text-muted-foreground">
                      <span className="line-through">{formatCurrency(Number(deal.original_price))}</span>
                      <Badge variant="outline" className="ml-2 text-green-600 border-green-200">
                        -{deal.discount_percent}%
                      </Badge>
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {deal.status !== "lost" && (
                    <Button
                      variant="outline"
                      onClick={() => setIsPaymentConfigOpen(true)}
                      className="border-blue-200 hover:bg-blue-50"
                    >
                      <CreditCard className="h-4 w-4 mr-2 text-blue-600" />
                      {hasLinks ? "Ver/Gerar Links" : "Configurar Pagamento"}
                    </Button>
                  )}
                  {deal.status !== "won" && deal.status !== "lost" && (
                    <Button
                      onClick={() => setIsWinDealOpen(true)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Trophy className="h-4 w-4 mr-2" />
                      Marcar Ganho
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {leadOrContact?.phone && (
                        <>
                          <DropdownMenuItem
                            onClick={() => window.open(`tel:${leadOrContact.phone}`, "_blank")}
                          >
                            <Phone className="h-4 w-4 mr-2" />
                            Ligar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              window.open(
                                `https://wa.me/55${leadOrContact.phone?.replace(/\D/g, "")}`,
                                "_blank"
                              )
                            }
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            WhatsApp
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {deal.lead_id && (
                        <DropdownMenuItem
                          onClick={(e) => navigateTo(e, `/comercial/leads/${deal.lead_id}`, navigate)}
                        >
                          <User className="h-4 w-4 mr-2" />
                          Ver Lead Completo
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Origem da oportunidade — webinario, UTMs, landing page, contexto */}
        {id && <DealOriginCard dealId={id} leadId={deal.lead_id} />}

        {/* Deal Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Detalhes do Deal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Produto</span>
                <span className="font-medium">{deal.product?.name || "N/A"}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Valor Original</span>
                <span>{formatCurrency(Number(deal.original_price) || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Valor Negociado</span>
                <span className="font-bold">{formatCurrency(Number(deal.negotiated_price) || 0)}</span>
              </div>
              {deal.discount_percent && deal.discount_percent > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Desconto</span>
                  <Badge variant="outline" className="text-green-600">
                    {deal.discount_percent}%
                  </Badge>
                </div>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Criado em</span>
                <span>{formatDate(deal.created_at)}</span>
              </div>
              {deal.expected_close_date && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Previsao de Fechamento</span>
                  <span>{formatDate(deal.expected_close_date)}</span>
                </div>
              )}
              {deal.won_at && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Ganho em</span>
                  <span className="text-green-600 font-medium">{formatDate(deal.won_at)}</span>
                </div>
              )}
              {deal.notes && (
                <>
                  <Separator />
                  <div>
                    <span className="text-sm text-muted-foreground">Observacoes</span>
                    <p className="mt-1 text-sm">{deal.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Payment Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Resumo Financeiro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-xs text-green-600 font-medium">Pago</p>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(totalPaid)}</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-xs text-yellow-600 font-medium">Pendente</p>
                  <p className="text-lg font-bold text-yellow-700">{formatCurrency(totalPending)}</p>
                </div>
              </div>

              {!hasPayments && (
                <div className="text-center py-6 text-muted-foreground">
                  <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum pagamento configurado</p>
                  {deal.status !== "lost" && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setIsPaymentConfigOpen(true)}
                      className="mt-2"
                    >
                      Configurar pagamentos
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payments List */}
        {hasPayments && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Pagamentos ({payments?.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {payments?.map((payment) => {
                    const statusConfig = PAYMENT_STATUS_CONFIG[payment.status] || PAYMENT_STATUS_CONFIG.pending;
                    const StatusIcon = statusConfig.icon;

                    return (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              payment.billing_type === "pix" && "bg-green-100",
                              payment.billing_type === "boleto" && "bg-orange-100",
                              payment.billing_type === "credit_card" && "bg-blue-100"
                            )}
                          >
                            <CreditCard
                              className={cn(
                                "h-5 w-5",
                                payment.billing_type === "pix" && "text-green-600",
                                payment.billing_type === "boleto" && "text-orange-600",
                                payment.billing_type === "credit_card" && "text-blue-600"
                              )}
                            />
                          </div>
                          <div>
                            <p className="font-medium">{payment.description || "Pagamento"}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>
                                {payment.billing_type === "pix" && "PIX"}
                                {payment.billing_type === "boleto" && "Boleto"}
                                {payment.billing_type === "credit_card" &&
                                  `Cartao ${payment.installments > 1 ? `${payment.installments}x` : ""}`}
                              </span>
                              <span>•</span>
                              <span>Vence: {formatDate(payment.due_date)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-bold">{formatCurrency(Number(payment.amount))}</p>
                            <Badge className={cn("text-xs", statusConfig.color)}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </div>

                          {payment.payment_link && (
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => copyToClipboard(payment.payment_link!)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => window.open(payment.payment_link!, "_blank")}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modals */}
      {deal && (
        <>
          <RegisterNegotiationModal
            open={isPaymentConfigOpen}
            onOpenChange={setIsPaymentConfigOpen}
            deal={deal}
            leadCpfCnpj={leadOrContact?.cpf_cnpj}
          />
          <WinDealModal
            open={isWinDealOpen}
            onOpenChange={setIsWinDealOpen}
            deal={deal}
          />
        </>
      )}
    </AppLayout>
  );
};

export default SalesDealDetail;
