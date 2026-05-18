import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SalesAlert, AlertType } from "@/types/sales.types";
import {
  Flame,
  ShoppingCart,
  RefreshCw,
  Clock,
  TrendingUp,
  FileText,
  AlertTriangle,
  Phone,
  MessageSquare,
  Check,
  X,
  ChevronRight,
  CalendarX,
  PhoneOff,
  ListTodo,
} from "lucide-react";

interface HotLeadAlertProps {
  alert: SalesAlert;
  onAction?: () => void;
  onDismiss?: () => void;
  onViewLead?: () => void;
  onCall?: () => void;
  onWhatsApp?: () => void;
  className?: string;
  compact?: boolean;
}

const alertTypeConfig: Record<
  AlertType,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  hot_lead: {
    label: "Lead Quente",
    icon: Flame,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  checkout_abandoned: {
    label: "Checkout Abandonado",
    icon: ShoppingCart,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  reengagement: {
    label: "Reengajamento",
    icon: RefreshCw,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  urgency_detected: {
    label: "Urgência Detectada",
    icon: Clock,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
  score_spike: {
    label: "Score em Alta",
    icon: TrendingUp,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  proposal_follow_up: {
    label: "Follow-up Proposta",
    icon: FileText,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  inactive_warning: {
    label: "Alerta Inatividade",
    icon: AlertTriangle,
    color: "text-slate-600",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
  },
  no_followup_critical: {
    label: "Sem Follow-up (Crítico)",
    icon: AlertTriangle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-300",
  },
  no_followup_medium: {
    label: "Sem Follow-up 48h+",
    icon: Clock,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  overdue_task: {
    label: "Tarefa Atrasada",
    icon: ListTodo,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  overdue_task_escalated: {
    label: "Tarefa Escalonada",
    icon: ListTodo,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-300",
  },
  unconfirmed_meeting: {
    label: "Reunião Não Confirmada",
    icon: CalendarX,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  unconfirmed_meeting_escalated: {
    label: "Reunião Escalonada",
    icon: PhoneOff,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-300",
  },
  no_show_max_attempts: {
    label: "No-show (3 tentativas)",
    icon: PhoneOff,
    color: "text-slate-600",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
  },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(date: string) {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `há ${diffMins}min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays}d`;
}

export function HotLeadAlert({
  alert,
  onAction,
  onDismiss,
  onViewLead,
  onCall,
  onWhatsApp,
  className,
  compact = false,
}: HotLeadAlertProps) {
  const config = alertTypeConfig[alert.alert_type];
  const Icon = config.icon;
  const contactName = alert.contact?.name || "Lead";

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer hover:shadow-sm",
          config.bgColor,
          config.borderColor,
          alert.is_read && "opacity-60",
          className
        )}
        onClick={onViewLead}
      >
        <div className={cn("p-1.5 rounded-full", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{contactName}</p>
          <p className="text-xs text-muted-foreground truncate">{alert.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-xs", config.color, config.borderColor)}>
            {alert.priority}
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all",
        config.borderColor,
        alert.is_read && "opacity-75",
        className
      )}
    >
      {/* Priority indicator bar */}
      <div
        className={cn(
          "h-1",
          alert.priority >= 8 ? "bg-red-500" :
          alert.priority >= 6 ? "bg-orange-500" :
          alert.priority >= 4 ? "bg-amber-500" :
          "bg-blue-500"
        )}
      />

      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className={cn("p-2 rounded-lg", config.bgColor)}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-xs", config.color, config.borderColor)}>
                {config.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {timeAgo(alert.created_at)}
              </span>
            </div>
            <h4 className="font-medium mt-1">{alert.title}</h4>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0",
              alert.priority >= 8 ? "border-red-300 text-red-600" :
              alert.priority >= 6 ? "border-orange-300 text-orange-600" :
              "border-muted text-muted-foreground"
            )}
          >
            P{alert.priority}
          </Badge>
        </div>

        {/* Contact info */}
        {alert.contact && (
          <div
            className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 mb-3 cursor-pointer hover:bg-muted transition-colors"
            onClick={onViewLead}
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={alert.contact.avatar_url} />
              <AvatarFallback className="text-xs">
                {getInitials(contactName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{contactName}</p>
              {alert.contact.sales_stage && (
                <p className="text-xs text-muted-foreground capitalize">
                  {alert.contact.sales_stage}
                </p>
              )}
            </div>
            {alert.contact.sales_score !== undefined && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  alert.contact.sales_score >= 70 ? "border-red-300 text-red-600" :
                  alert.contact.sales_score >= 50 ? "border-orange-300 text-orange-600" :
                  "border-muted text-muted-foreground"
                )}
              >
                Score: {alert.contact.sales_score}
              </Badge>
            )}
          </div>
        )}

        {/* Description */}
        {alert.description && (
          <p className="text-sm text-muted-foreground mb-3">{alert.description}</p>
        )}

        {/* AI Reasoning */}
        {alert.ai_reasoning && (
          <div className="text-xs text-muted-foreground p-2 rounded bg-muted/30 mb-3 border-l-2 border-primary/30">
            <span className="font-medium">IA:</span> {alert.ai_reasoning}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t">
          {onCall && (
            <Button variant="outline" size="sm" onClick={onCall} className="flex-1">
              <Phone className="h-3.5 w-3.5 mr-1" />
              Ligar
            </Button>
          )}
          {onWhatsApp && (
            <Button variant="outline" size="sm" onClick={onWhatsApp} className="flex-1">
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              WhatsApp
            </Button>
          )}
          {onAction && !alert.is_actioned && (
            <Button size="sm" onClick={onAction} className="flex-1">
              <Check className="h-3.5 w-3.5 mr-1" />
              Ação tomada
            </Button>
          )}
          {onDismiss && !alert.is_actioned && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// List of hot lead alerts for dashboard
export function HotLeadAlertList({
  alerts,
  onViewAll,
  onAlertClick,
  className,
  maxItems = 5,
}: {
  alerts: SalesAlert[];
  onViewAll?: () => void;
  onAlertClick?: (alert: SalesAlert) => void;
  className?: string;
  maxItems?: number;
}) {
  const displayAlerts = alerts.slice(0, maxItems);
  const hasMore = alerts.length > maxItems;

  if (alerts.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <Flame className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhum lead quente no momento
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {displayAlerts.map((alert) => (
        <HotLeadAlert
          key={alert.id}
          alert={alert}
          compact
          onViewLead={() => onAlertClick?.(alert)}
        />
      ))}
      {hasMore && onViewAll && (
        <Button variant="ghost" className="w-full" onClick={onViewAll}>
          Ver todos ({alerts.length})
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      )}
    </div>
  );
}
