import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, Target, Flame, Check, X, ExternalLink, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useSocialSellerAlerts,
  useUpdateAlertStatus,
  type SocialSellerAlert,
} from "@/hooks/useInstagram";

interface SocialSellerAlertsProps {
  onConversationClick?: (conversationId: string) => void;
}

function AlertCard({
  alert,
  onAction,
  onDismiss,
  onConversationClick,
}: {
  alert: SocialSellerAlert;
  onAction: () => void;
  onDismiss: () => void;
  onConversationClick?: () => void;
}) {
  const timeAgo = formatDistanceToNow(new Date(alert.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  const conversation = alert.conversation as any;
  const displayName = conversation?.participant_name || conversation?.participant_username || "Usuário";

  const getAlertIcon = () => {
    switch (alert.alert_type) {
      case "keyword_detected":
        return <Target className="h-4 w-4 text-red-500" />;
      case "stage_change":
        return <Flame className="h-4 w-4 text-orange-500" />;
      case "high_engagement":
        return <MessageCircle className="h-4 w-4 text-blue-500" />;
      default:
        return <Bell className="h-4 w-4 text-purple-500" />;
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg bg-background hover:bg-muted/30 transition-colors">
      {/* Avatar */}
      <Avatar className="h-10 w-10 cursor-pointer" onClick={onConversationClick}>
        <AvatarImage src={conversation?.participant_profile_pic} />
        <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm">
          {displayName.substring(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {getAlertIcon()}
          <span className="font-medium truncate">{alert.title}</span>
        </div>

        {alert.message && (
          <p className="text-sm text-muted-foreground mt-0.5">{alert.message}</p>
        )}

        {alert.trigger_message && (
          <div className="mt-2 p-2 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground mb-1">Mensagem que disparou:</p>
            <p className="text-sm italic">"{alert.trigger_message}"</p>
          </div>
        )}

        {alert.detected_keywords && alert.detected_keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {alert.detected_keywords.map((keyword, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {keyword}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDismiss}>
              <X className="h-3 w-3 mr-1" />
              Ignorar
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={onAction}>
              <Check className="h-3 w-3 mr-1" />
              Agir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SocialSellerAlerts({ onConversationClick }: SocialSellerAlertsProps) {
  const { data: alerts = [], isLoading } = useSocialSellerAlerts("pending");
  const updateAlert = useUpdateAlertStatus();

  const handleAction = async (alertId: string, conversationId?: string) => {
    await updateAlert.mutateAsync({ alertId, status: "actioned" });
    if (conversationId) {
      onConversationClick?.(conversationId);
    }
  };

  const handleDismiss = async (alertId: string) => {
    await updateAlert.mutateAsync({ alertId, status: "dismissed" });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Nenhum alerta pendente</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Alertas
          <Badge variant="destructive" className="ml-auto">
            {alerts.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2 p-4 pt-0">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAction={() => handleAction(alert.id, alert.conversation_id)}
                onDismiss={() => handleDismiss(alert.id)}
                onConversationClick={() => onConversationClick?.(alert.conversation_id)}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
