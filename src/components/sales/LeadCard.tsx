import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SalesLead } from "@/types/sales.types";
import { SalesStageBadge } from "./SalesStageBadge";
import { LeadScoreBadge, LeadScoreBar } from "./LeadScoreBadge";
import { BANTIndicator } from "./BANTIndicator";
import { LeadTagsBadges } from "./LeadTagsInput";
import {
  MoreHorizontal,
  Phone,
  MessageSquare,
  Calendar,
  ExternalLink,
  User,
  Mail,
  Building,
  Flame,
  Star,
} from "lucide-react";
import { useUpdateLeadSales } from "@/hooks/useSalesLeads";

interface LeadCardProps {
  lead: SalesLead;
  onView?: () => void;
  onCall?: () => void;
  onWhatsApp?: () => void;
  onEmail?: () => void;
  onSchedule?: () => void;
  onCreateDeal?: () => void;
  className?: string;
  compact?: boolean;
  showScore?: boolean;
  showBANT?: boolean;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatPhone(phone?: string) {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function LeadCard({
  lead,
  onView,
  onCall,
  onWhatsApp,
  onEmail,
  onSchedule,
  onCreateDeal,
  className,
  compact = false,
  showScore = true,
  showBANT = true,
}: LeadCardProps) {
  const isHot = lead.sales_score >= 70 || lead.ai_urgency_level >= 7;
  const updateLead = useUpdateLeadSales();
  const starType = lead.star_type;
  const isOrangeStar = starType === 'orange';

  const handleStarToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next: 'yellow' | 'orange' | null =
      starType === null || starType === undefined ? 'yellow' :
      starType === 'yellow' ? 'orange' : null;
    updateLead.mutate({ id: lead.id, star_type: next });
  };

  if (compact) {
    return (
      <Card
        className={cn(
          "cursor-pointer hover:shadow-md transition-all group relative",
          isOrangeStar && "border-2 border-[#FF6B00] shadow-[0_0_8px_#FF6B00]",
          !isOrangeStar && isHot && "border-red-200 bg-red-50/30",
          className
        )}
        onClick={onView}
      >
        <CardContent className="p-3">
          {/* Star toggle */}
          <button
            onClick={handleStarToggle}
            className={cn(
              "absolute top-1 right-1 z-10 p-0.5 rounded transition-all",
              starType ? "opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
            )}
          >
            <Star className={cn(
              "h-3.5 w-3.5",
              isOrangeStar && "fill-[#FF6B00] text-[#FF6B00]",
              starType === 'yellow' && !isOrangeStar && "fill-[#FFD700] text-[#FFD700]",
              !starType && "text-slate-300"
            )} />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-10 w-10">
                <AvatarImage src={lead.avatar_url} />
                <AvatarFallback className="bg-primary/10">
                  {getInitials(lead.name)}
                </AvatarFallback>
              </Avatar>
              {isHot && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                  <Flame className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{lead.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <SalesStageBadge stage={lead.sales_stage} size="sm" showIcon={false} />
                {showScore && <LeadScoreBadge score={lead.sales_score} size="sm" showLabel={false} />}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onCall && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCall();
                  }}
                >
                  <Phone className="h-4 w-4" />
                </Button>
              )}
              {onWhatsApp && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onWhatsApp();
                  }}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "group transition-all relative",
        isOrangeStar && "border-2 border-[#FF6B00] shadow-[0_0_8px_#FF6B00]",
        !isOrangeStar && isHot && "border-red-200 bg-red-50/30",
        className
      )}
    >
      <CardContent className="p-4">
        {/* Star toggle */}
        <button
          onClick={handleStarToggle}
          className={cn(
            "absolute top-2 right-2 z-10 p-1 rounded transition-all",
            starType ? "opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
          )}
        >
          <Star className={cn(
            "h-4 w-4",
            isOrangeStar && "fill-[#FF6B00] text-[#FF6B00] drop-shadow-[0_0_4px_#FF6B00]",
            starType === 'yellow' && !isOrangeStar && "fill-[#FFD700] text-[#FFD700]",
            !starType && "text-slate-300"
          )} />
        </button>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <Avatar className="h-12 w-12">
                <AvatarImage src={lead.avatar_url} />
                <AvatarFallback className="bg-primary/10">
                  {getInitials(lead.name)}
                </AvatarFallback>
              </Avatar>
              {isHot && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                  <Flame className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{lead.name}</p>
              {lead.company_name && (
                <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
                  <Building className="h-3 w-3" />
                  {lead.company_name}
                </p>
              )}
              {lead.role && (
                <p className="text-xs text-muted-foreground truncate">{lead.role}</p>
              )}
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
                  Ver perfil completo
                </DropdownMenuItem>
              )}
              {onCall && lead.phone && (
                <DropdownMenuItem onClick={onCall}>
                  <Phone className="h-4 w-4 mr-2" />
                  Ligar ({formatPhone(lead.phone)})
                </DropdownMenuItem>
              )}
              {onWhatsApp && lead.phone && (
                <DropdownMenuItem onClick={onWhatsApp}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  WhatsApp
                </DropdownMenuItem>
              )}
              {onEmail && lead.email && (
                <DropdownMenuItem onClick={onEmail}>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar email
                </DropdownMenuItem>
              )}
              {onSchedule && (
                <DropdownMenuItem onClick={onSchedule}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Agendar reunião
                </DropdownMenuItem>
              )}
              {onCreateDeal && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onCreateDeal}>
                    <User className="h-4 w-4 mr-2" />
                    Criar oportunidade
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Stage and Score */}
        <div className="flex items-center gap-2 mb-3">
          <SalesStageBadge stage={lead.sales_stage} />
          {showScore && (
            <LeadScoreBadge
              score={lead.sales_score}
              reason={lead.sales_score_reason}
            />
          )}
        </div>

        {/* Tags */}
        {((lead.tags && lead.tags.length > 0) || lead.created_at) && (
          <div className="mb-3">
            <LeadTagsBadges tags={lead.tags} createdAt={lead.created_at} max={3} size="sm" />
          </div>
        )}

        {/* Score bar */}
        {showScore && (
          <div className="mb-3">
            <LeadScoreBar score={lead.sales_score} />
          </div>
        )}

        {/* BANT */}
        {showBANT && (
          <div className="mb-3 p-2 rounded-lg bg-muted/50">
            <BANTIndicator
              bant={{
                budget: lead.bant_budget ?? null,
                authority: lead.bant_authority ?? null,
                need: lead.bant_need ?? null,
                timeline: lead.bant_timeline ?? null,
              }}
              showLabels
            />
          </div>
        )}

        {/* Contact info */}
        <div className="space-y-1 text-sm text-muted-foreground mb-3">
          {lead.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              <span>{formatPhone(lead.phone)}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
        </div>

        {/* AI Insights preview */}
        {lead.ai_sentiment && (
          <div className="text-xs text-muted-foreground p-2 rounded bg-muted/30 mb-3 border-l-2 border-primary/30">
            <span className="font-medium">Sentimento:</span>{" "}
            <span className={cn(
              lead.ai_sentiment === 'positive' ? "text-emerald-600" :
              lead.ai_sentiment === 'negative' ? "text-red-600" :
              "text-muted-foreground"
            )}>
              {lead.ai_sentiment === 'positive' ? 'Positivo' :
               lead.ai_sentiment === 'negative' ? 'Negativo' :
               lead.ai_sentiment === 'mixed' ? 'Misto' : 'Neutro'}
            </span>
            {lead.ai_urgency_level > 5 && (
              <span className="ml-2 text-amber-600">
                | Urgência: {lead.ai_urgency_level}/10
              </span>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div className="flex items-center gap-1 pt-3 border-t">
          {onCall && lead.phone && (
            <Button variant="ghost" size="sm" onClick={onCall} className="flex-1">
              <Phone className="h-3.5 w-3.5 mr-1" />
              Ligar
            </Button>
          )}
          {onWhatsApp && lead.phone && (
            <Button variant="ghost" size="sm" onClick={onWhatsApp} className="flex-1">
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              WhatsApp
            </Button>
          )}
          {onView && (
            <Button variant="outline" size="sm" onClick={onView} className="flex-1">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Ver mais
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Kanban-style lead card for pipeline view
export function LeadKanbanCard({
  lead,
  onView,
  onDragStart,
  isDragging,
  className,
}: {
  lead: SalesLead;
  onView?: () => void;
  onDragStart?: () => void;
  isDragging?: boolean;
  className?: string;
}) {
  const isHot = lead.sales_score >= 70;

  return (
    <Card
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all",
        isDragging && "opacity-50 scale-95",
        isHot && "border-red-200",
        className
      )}
      onClick={onView}
      draggable
      onDragStart={onDragStart}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={lead.avatar_url} />
            <AvatarFallback className="text-xs">
              {getInitials(lead.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate flex-1">{lead.name}</span>
          {isHot && <Flame className="h-4 w-4 text-red-500" />}
        </div>

        {lead.company_name && (
          <p className="text-xs text-muted-foreground truncate">{lead.company_name}</p>
        )}

        {((lead.tags && lead.tags.length > 0) || lead.created_at) && (
          <LeadTagsBadges tags={lead.tags} createdAt={lead.created_at} max={2} size="xs" />
        )}

        <div className="flex items-center justify-between">
          <LeadScoreBadge score={lead.sales_score} size="sm" showLabel={false} />
          <BANTIndicator
            bant={{
              budget: lead.bant_budget ?? null,
              authority: lead.bant_authority ?? null,
              need: lead.bant_need ?? null,
              timeline: lead.bant_timeline ?? null,
            }}
            size="sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}
