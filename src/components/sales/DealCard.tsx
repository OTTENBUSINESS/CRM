import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Deal } from "@/types/sales.types";
import {
  MoreHorizontal,
  FileText,
  Calendar,
  Trophy,
  XCircle,
  ExternalLink,
  TrendingUp,
  CreditCard,
  Pencil,
  Trash2,
  GitBranch,
  Users,
  Crown,
  Building2,
  UserPlus,
  ArrowRightCircle,
  HandCoins,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDemoMode } from "@/contexts/DemoModeContext";

interface DealCardProps {
  deal: Deal;
  onView?: () => void;
  onEdit?: () => void;
  onSendProposal?: () => void;
  onSchedule?: () => void;
  onConfigurePayment?: () => void;
  onWin?: () => void;
  onLose?: () => void;
  onDelete?: () => void;
  onTransferPipeline?: () => void;
  onAddContact?: () => void;
  className?: string;
  compact?: boolean;
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

export function DealCard({
  deal,
  onView,
  onEdit,
  onSendProposal,
  onSchedule,
  onConfigurePayment,
  onWin,
  onLose,
  onDelete,
  onTransferPipeline,
  onAddContact,
  className,
  compact = false,
}: DealCardProps) {
  const navigate = useNavigate();
  const { dv } = useDemoMode();
  const hasDiscount = deal.discount_percent && deal.discount_percent > 0;
  const leadOrContact = deal.lead || deal.contact;
  const contacts = (deal as any).contacts as any[] | undefined;
  const hasMultipleContacts = contacts && contacts.length >= 2;

  // Para multi-contact: buscar company_name de qualquer contato
  const companyName = hasMultipleContacts
    ? contacts.find((c: any) => c.lead?.company_name)?.lead?.company_name
    : null;

  const contactName = companyName || leadOrContact?.name || "Sem contato";
  const productName = deal.product?.name || "Sem produto";

  if (compact) {
    return (
      <Card
        className={cn(
          "cursor-pointer hover:shadow-md transition-shadow",
          className
        )}
        onClick={onView}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={leadOrContact?.avatar_url} />
              <AvatarFallback className="text-xs bg-primary/10">
                {getInitials(contactName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{contactName}</p>
              <p className="text-xs text-muted-foreground truncate">{productName}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-primary">
                {formatCurrency(dv(deal.negotiated_price))}
              </p>
              {deal.ai_win_probability > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  {deal.ai_win_probability}%
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("group", className)}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={leadOrContact?.avatar_url} />
              <AvatarFallback className="bg-primary/10">
                {getInitials(contactName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium truncate flex items-center gap-1.5">
                {hasMultipleContacts && companyName && <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                {contactName}
                {hasMultipleContacts && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1 flex-shrink-0">
                    <Users className="h-2.5 w-2.5 mr-0.5" />{contacts.length}
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {hasMultipleContacts && companyName
                  ? contacts.map((c: any) => c.lead?.name || "?").join(", ")
                  : deal.organization?.name || productName}
              </p>
              {/* Webinario badges + atendencia + fonte */}
              {(() => {
                const enrollment = (deal as any).webinar_enrollment;
                const utmSource = (deal.lead as any)?.utm_source;
                if (!enrollment?.webinar_title && !utmSource) return null;

                // Status atendencia (so se tem webinario)
                let attendanceBadge: React.ReactNode = null;
                if (enrollment?.webinar_title) {
                  const eventDate = enrollment.event_date ? new Date(enrollment.event_date) : null;
                  const eventHasHappened = eventDate ? eventDate <= new Date() : false;
                  if (!eventHasHappened) {
                    attendanceBadge = (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
                        Aguardando
                      </span>
                    );
                  } else if (enrollment.attended) {
                    const mins = enrollment.attended_duration || 0;
                    const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? `${mins % 60}m` : ''}` : mins > 0 ? `${mins}min` : '';
                    attendanceBadge = (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">
                        ✓ {dur || 'Compareceu'}
                      </span>
                    );
                  } else {
                    attendanceBadge = (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium">
                        Faltou
                      </span>
                    );
                  }
                }

                // Source label compacto
                const sourceMap: Record<string, string> = {
                  facebook: 'FB', instagram: 'IG', ig: 'IG', google: 'GG',
                  whatsapp: 'WA', organic: 'Org', direct: 'Direto',
                };
                const sourceShort = utmSource ? (sourceMap[utmSource.toLowerCase()] || utmSource) : null;

                return (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {enrollment?.webinar_title && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-medium max-w-[140px] truncate">
                        <Sparkles className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{enrollment.webinar_title}</span>
                      </span>
                    )}
                    {attendanceBadge}
                    {sourceShort && (
                      <span
                        className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium"
                        title={`Origem: ${utmSource}`}
                      >
                        {sourceShort}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onView && (
                <DropdownMenuItem onClick={onView}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver detalhes
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar deal
                </DropdownMenuItem>
              )}
              {onSchedule && (
                <DropdownMenuItem onClick={onSchedule}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Agendar reunião
                </DropdownMenuItem>
              )}
              {onSendProposal && (
                <DropdownMenuItem onClick={onSendProposal}>
                  <FileText className="h-4 w-4 mr-2" />
                  Enviar proposta
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onConfigurePayment && (
                <DropdownMenuItem onClick={onConfigurePayment} className="text-blue-600">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Gerar links de pagamento
                </DropdownMenuItem>
              )}
              {onTransferPipeline && (
                <DropdownMenuItem onClick={onTransferPipeline} className="text-indigo-600">
                  <GitBranch className="h-4 w-4 mr-2" />
                  Transferir de pipeline
                </DropdownMenuItem>
              )}
              {onWin && (
                <DropdownMenuItem onClick={onWin} className="text-emerald-600">
                  <Trophy className="h-4 w-4 mr-2" />
                  Marcar como ganho
                </DropdownMenuItem>
              )}
              {onLose && (
                <DropdownMenuItem onClick={onLose} className="text-red-600">
                  <XCircle className="h-4 w-4 mr-2" />
                  Marcar como perdido
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-red-600">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir deal
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Product & SDR */}
        <div className="mb-3 flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {productName}
          </Badge>
          {deal.sdr && (
            <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
              SDR: {deal.sdr.name?.split(' ')[0]}
            </Badge>
          )}
          {(deal.commitment_amount ?? 0) > 0 && (
            <Badge className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
              <HandCoins className="h-3 w-3 mr-1" />
              Sinal {formatCurrency(dv(deal.commitment_amount!))}
            </Badge>
          )}
        </div>

        {/* Multi-contact: lista de contatos clicáveis */}
        {hasMultipleContacts && (
          <div className="mb-3 p-2 bg-muted/30 rounded-lg space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              {contacts.length} contatos vinculados
            </p>
            {contacts.map((contact: any) => (
              <div
                key={contact.id}
                className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  if (contact.lead_id) navigate(`/comercial/leads/${contact.lead_id}`);
                }}
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className={cn(
                    "text-[10px]",
                    contact.is_primary ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                  )}>
                    {getInitials(contact.lead?.name || "?")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{contact.lead?.name || "Sem nome"}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {contact.is_primary && <Crown className="h-3 w-3 text-amber-500" />}
                  {contact.role && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">{contact.role}</Badge>
                  )}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pricing */}
        <div className="space-y-1 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Valor</span>
            <span className="font-bold text-lg text-primary">
              {formatCurrency(dv(deal.negotiated_price))}
            </span>
          </div>
          {hasDiscount && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                <span className="line-through">{formatCurrency(dv(deal.original_price))}</span>
              </span>
              <Badge variant="outline" className="text-emerald-600 border-emerald-200">
                -{deal.discount_percent}%
              </Badge>
            </div>
          )}
        </div>

        {/* AI Win Probability */}
        {deal.ai_win_probability > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Prob. de fechamento</span>
              <span className={cn(
                "font-medium",
                deal.ai_win_probability >= 70 ? "text-emerald-600" :
                deal.ai_win_probability >= 40 ? "text-amber-600" :
                "text-red-600"
              )}>
                {deal.ai_win_probability}%
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  deal.ai_win_probability >= 70 ? "bg-emerald-500" :
                  deal.ai_win_probability >= 40 ? "bg-amber-500" :
                  "bg-red-500"
                )}
                style={{ width: `${deal.ai_win_probability}%` }}
              />
            </div>
          </div>
        )}

        {/* Expected close date */}
        {deal.expected_close_date && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>
              Previsão:{" "}
              {new Date(deal.expected_close_date).toLocaleDateString("pt-BR")}
            </span>
          </div>
        )}

        {/* Quick actions */}
        <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t">
          {/* Prominent transfer button for Pré-Vendas deals */}
          {onTransferPipeline && deal.pipeline_id === 'fabb8cee-ca6c-4980-9b88-919c85e0b12f' && (
            <Button
              variant="default"
              size="sm"
              onClick={onTransferPipeline}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <ArrowRightCircle className="h-3.5 w-3.5 mr-1.5" />
              Passar para Closer
            </Button>
          )}
          <div className="flex items-center gap-1">
            {onView && (
              <Button variant="outline" size="sm" onClick={onView} className="flex-1">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Ver Deal
              </Button>
            )}
            {onAddContact && (
              <Button variant="outline" size="sm" onClick={onAddContact} className="flex-1">
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                Adicionar Decisor
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Kanban-style deal card for pipeline view
export function DealKanbanCard({
  deal,
  onView,
  onDragStart,
  isDragging,
  className,
}: {
  deal: Deal;
  onView?: () => void;
  onDragStart?: () => void;
  isDragging?: boolean;
  className?: string;
}) {
  const { dv } = useDemoMode();
  const leadOrContact = deal.lead || deal.contact;
  const contactName = leadOrContact?.name || "Sem contato";

  return (
    <Card
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all",
        isDragging && "opacity-50 scale-95",
        className
      )}
      onClick={onView}
      draggable
      onDragStart={onDragStart}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={leadOrContact?.avatar_url} />
            <AvatarFallback className="text-xs">
              {getInitials(contactName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate flex-1">{contactName}</span>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <p className="text-xs text-muted-foreground truncate">
            {deal.product?.name}
          </p>
          {(deal.commitment_amount ?? 0) > 0 && (
            <Badge className="text-[10px] h-4 px-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
              <HandCoins className="h-2.5 w-2.5 mr-0.5" />
              Sinal
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="font-bold text-primary">
            {formatCurrency(dv(deal.negotiated_price))}
          </span>
          {deal.ai_win_probability > 0 && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                deal.ai_win_probability >= 70 ? "border-emerald-300 text-emerald-600" :
                deal.ai_win_probability >= 40 ? "border-amber-300 text-amber-600" :
                "border-red-300 text-red-600"
              )}
            >
              {deal.ai_win_probability}%
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
