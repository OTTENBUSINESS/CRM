/**
 * InstanceHealthBanner — Alerta de saúde de envio por instância
 *
 * Vendedor: vê banner simples (verde/amarelo/vermelho + frase)
 * Admin: vê badge no header + painel com todas instâncias
 */
import { useState } from "react";
import { useInstanceHealth, useAllInstancesHealth, type InstanceHealth, type HealthLevel } from "@/hooks/useInstanceHealth";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Shield, ShieldAlert, ShieldCheck, ShieldX, ChevronDown, MessageSquare, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════ BANNER PRO VENDEDOR (dentro do inbox/chat) ═══════

interface InstanceHealthInlineBannerProps {
  instanceId?: string | undefined | null;
}

export function InstanceHealthInlineBanner({ instanceId }: InstanceHealthInlineBannerProps) {
  const { teamMember } = useAuth();
  // Usa a instância passada, ou a do vendedor logado
  const effectiveInstanceId = instanceId || teamMember?.whatsapp_instance_id;
  const { data: health, isLoading } = useInstanceHealth(effectiveInstanceId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading || !health) return null;

  return (
    <div
      className={cn(
        "mx-2 mb-2 rounded-lg border px-4 py-2.5 transition-all",
        health.level === "green" && "bg-green-50/50 border-green-200/50 dark:bg-green-950/10 dark:border-green-800/30",
        health.level === "yellow" && "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 cursor-pointer",
        health.level === "red" && "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800 animate-pulse cursor-pointer",
      )}
      onClick={health.level !== "green" ? () => setExpanded(!expanded) : undefined}
    >
      <div className="flex items-center gap-3">
        {health.level === "green" ? (
          <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" />
        ) : health.level === "yellow" ? (
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
        ) : (
          <ShieldX className="h-5 w-5 text-red-600 shrink-0" />
        )}
        <p className={cn(
          "text-sm flex-1",
          health.level === "green" && "text-green-700/70 dark:text-green-300/70 text-xs",
          health.level === "yellow" && "text-amber-800 dark:text-amber-200 font-medium",
          health.level === "red" && "text-red-800 dark:text-red-200 font-medium",
        )}>
          {health.message}
        </p>
        {health.level !== "green" && (
          <ChevronDown className={cn(
            "h-4 w-4 transition-transform shrink-0",
            expanded && "rotate-180",
            health.level === "yellow" ? "text-amber-500" : "text-red-500"
          )} />
        )}
      </div>

      {/* Detalhes expandidos */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-current/10 space-y-2">
          <HealthMetricRow
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            label="Msgs enviadas (última hora)"
            value={health.metrics.msgsLastHour}
            max={35}
            level={health.level}
          />
          <HealthMetricRow
            icon={<Users className="h-3.5 w-3.5" />}
            label="Leads sem resposta"
            value={health.metrics.leadsNoReply}
            max={25}
            level={health.level}
          />
          <HealthMetricRow
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Msgs no último minuto"
            value={health.metrics.msgsLastMinute}
            max={4}
            level={health.level}
          />
        </div>
      )}
    </div>
  );
}

function HealthMetricRow({ icon, label, value, max, level }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  max: number;
  level: HealthLevel;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const overLimit = value > max;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <span className={cn(
          "font-bold tabular-nums",
          overLimit ? "text-red-600" : level === "yellow" ? "text-amber-600" : "text-muted-foreground"
        )}>
          {value}/{max}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            pct < 60 && "bg-green-500",
            pct >= 60 && pct < 85 && "bg-amber-500",
            pct >= 85 && "bg-red-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ═══════ BADGE PRO HEADER (admin vê todas instâncias) ═══════

export function InstanceHealthHeaderBadge() {
  const { teamMember: hbTeamMember } = useAuth();
  const isAdmin = hbTeamMember?.role === "admin" || hbTeamMember?.role === "diretor";
  const { data: allHealth } = useAllInstancesHealth();
  const [showModal, setShowModal] = useState(false);

  if (!isAdmin || !allHealth) return null;

  const worst = allHealth.reduce<HealthLevel>((acc, h) => {
    if (h.level === "red") return "red";
    if (h.level === "yellow" && acc !== "red") return "yellow";
    return acc;
  }, "green");

  const problemCount = allHealth.filter(h => h.level !== "green").length;

  if (worst === "green") return null;

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-colors",
          worst === "yellow" && "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300",
          worst === "red" && "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 animate-pulse",
        )}
        onClick={() => setShowModal(true)}
        title="Saúde das instâncias WhatsApp"
      >
        {worst === "red" ? (
          <ShieldX className="h-4 w-4" />
        ) : (
          <ShieldAlert className="h-4 w-4" />
        )}
        <span className="text-xs font-bold whitespace-nowrap">
          {problemCount === 1
            ? `${allHealth.find(h => h.level !== "green")?.instanceName} em risco`
            : `${problemCount} instâncias em risco`}
        </span>
      </div>

      {/* Modal admin com detalhes */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Saúde das Instâncias
            </DialogTitle>
            <DialogDescription>
              Monitoramento de risco de bloqueio por instância
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {allHealth.map((health) => (
              <InstanceHealthCard key={health.instanceId} health={health} />
            ))}
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Atualiza a cada 30 segundos. Limites: 35 msgs/hora, 25 leads sem resposta, 4 leads/minuto.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InstanceHealthCard({ health }: { health: InstanceHealth }) {
  const levelConfig = {
    green: { bg: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800", icon: ShieldCheck, iconColor: "text-green-600", label: "Saudável" },
    yellow: { bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800", icon: ShieldAlert, iconColor: "text-amber-600", label: "Atenção" },
    red: { bg: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800", icon: ShieldX, iconColor: "text-red-600", label: "Crítico" },
  }[health.level];

  const LevelIcon = levelConfig.icon;

  return (
    <div className={cn("rounded-lg border p-4 space-y-3", levelConfig.bg)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LevelIcon className={cn("h-5 w-5", levelConfig.iconColor)} />
          <span className="font-semibold text-sm">{health.instanceName}</span>
        </div>
        <span className={cn(
          "text-xs font-bold px-2 py-0.5 rounded-full",
          health.level === "green" && "bg-green-200 text-green-800",
          health.level === "yellow" && "bg-amber-200 text-amber-800",
          health.level === "red" && "bg-red-200 text-red-800",
        )}>
          {levelConfig.label}
        </span>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3">
        <MetricPill label="Msgs/hora" value={health.metrics.msgsLastHour} max={35} />
        <MetricPill label="Sem resposta" value={health.metrics.leadsNoReply} max={25} />
        <MetricPill label="Msgs/min" value={health.metrics.msgsLastMinute} max={4} />
      </div>

      {/* Mensagem */}
      {health.level !== "green" && (
        <p className={cn(
          "text-xs",
          health.level === "yellow" ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"
        )}>
          {health.message}
        </p>
      )}
    </div>
  );
}

function MetricPill({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="text-center space-y-1">
      <p className={cn(
        "text-lg font-bold tabular-nums",
        pct < 60 && "text-green-700",
        pct >= 60 && pct < 85 && "text-amber-700",
        pct >= 85 && "text-red-700",
      )}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct < 60 && "bg-green-500",
            pct >= 60 && pct < 85 && "bg-amber-500",
            pct >= 85 && "bg-red-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
