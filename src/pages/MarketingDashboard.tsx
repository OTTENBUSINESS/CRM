import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mail,
  Send,
  CheckCircle2,
  Eye,
  MousePointerClick,
  AlertTriangle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  useEmailKpis,
  useEmailSendsTimeseries,
  useEmailSendsLog,
  type EmailSendLogRow,
} from "@/hooks/useEmailMarketing";
import EmailTimelineModal from "@/components/client360/EmailTimelineModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PAGE_SIZE = 20;

function fmtDate(dt?: string | null) {
  if (!dt) return "-";
  try {
    return format(new Date(dt), "dd/MM/yy HH:mm", { locale: ptBR });
  } catch {
    return "-";
  }
}

// Config visual dos status de envio (mesma paleta usada no resto do módulo de email)
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  sent: { label: "Enviado", className: "bg-blue-500/10 text-blue-600" },
  delivered: { label: "Entregue", className: "bg-teal-500/10 text-teal-600" },
  opened: { label: "Aberto", className: "bg-indigo-500/10 text-indigo-600" },
  clicked: { label: "Clicado", className: "bg-purple-500/10 text-purple-600" },
  bounced: { label: "Rebatido", className: "bg-red-500/10 text-red-600" },
  failed: { label: "Falhou", className: "bg-red-500/10 text-red-600" },
  pending: { label: "Pendente", className: "bg-muted text-muted-foreground" },
};

const MarketingDashboard = () => {
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<EmailSendLogRow | null>(null);

  const { data: kpis, isLoading: kpisLoading } = useEmailKpis(30);
  const { data: timeseries } = useEmailSendsTimeseries(14);
  const { data: log, isLoading: logLoading } = useEmailSendsLog({
    page,
    pageSize: PAGE_SIZE,
  });

  const rows = log?.rows || [];
  const total = log?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Falhas = envios sem entrega e sem bounce, com erro ou status failed
  const totalFailed = kpis
    ? Math.max(
        0,
        kpis.total_sent -
          kpis.total_delivered -
          kpis.total_bounced,
      )
    : 0;

  const kpiCards = [
    {
      label: "Enviados",
      value: kpis?.total_sent ?? 0,
      icon: Send,
      color: "text-blue-600",
    },
    {
      label: "Entregues",
      value: kpis?.total_delivered ?? 0,
      icon: CheckCircle2,
      color: "text-teal-600",
    },
    {
      label: "Aberturas",
      value: kpis?.total_opened ?? 0,
      hint: kpis ? `${kpis.open_rate}%` : undefined,
      icon: Eye,
      color: "text-indigo-600",
    },
    {
      label: "Cliques",
      value: kpis?.total_clicked ?? 0,
      hint: kpis ? `${kpis.click_rate}%` : undefined,
      icon: MousePointerClick,
      color: "text-purple-600",
    },
    {
      label: "Bounces",
      value: kpis?.total_bounced ?? 0,
      icon: AlertTriangle,
      color: "text-red-600",
    },
    {
      label: "Falhas",
      value: totalFailed,
      icon: XCircle,
      color: "text-red-600",
    },
  ];

  // Mini-gráfico de barras (envios/dia) — sem lib, só divs
  const maxSent = Math.max(1, ...(timeseries || []).map((p) => p.sent));

  // Monta o metadata que o EmailTimelineModal espera a partir da linha de log
  const buildMetadata = (row: EmailSendLogRow): Record<string, any> => ({
    subject: row.campaign?.subject || "Email",
    html: row.html,
    campaign_name: row.campaign?.name || null,
    campaign_id: row.campaign_id || null,
    to_email: row.email,
    sent_at: row.sent_at,
    delivered_at: row.delivered_at,
    opened_at: row.opened_at,
    clicked_at: row.clicked_at,
    bounced_at: row.bounced_at,
    open_count: row.open_count || 0,
    click_count: row.click_count || 0,
    clicked_url: row.clicked_url,
    bounce_reason: row.bounce_reason,
  });

  const handleRowClick = (row: EmailSendLogRow) => {
    if (!row.html) return;
    setSelectedRow(row);
  };

  return (
    <AppLayout
      title="Marketing"
      subtitle="Painel de email marketing — envios, entregas e engajamento"
      icon={<Mail className="h-6 w-6" />}
      breadcrumbs={[{ label: "Marketing" }]}
    >
      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {kpi.label}
                  </span>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums">
                    {kpisLoading ? "—" : kpi.value.toLocaleString("pt-BR")}
                  </span>
                  {kpi.hint && (
                    <span className="text-xs text-muted-foreground">
                      {kpi.hint}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mini-gráfico de envios por dia */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Envios por dia (últimos 14 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {timeseries && timeseries.length > 0 ? (
              <div className="flex items-end gap-1 h-40">
                {timeseries.map((point) => (
                  <div
                    key={point.date}
                    className="flex-1 flex flex-col items-center gap-1 group"
                    title={`${point.date}: ${point.sent} enviados, ${point.opened} abertos, ${point.clicked} cliques`}
                  >
                    <div className="w-full flex items-end justify-center h-32">
                      <div
                        className="w-full max-w-[24px] bg-primary/80 rounded-t transition-all group-hover:bg-primary"
                        style={{
                          height: `${(point.sent / maxSent) * 100}%`,
                          minHeight: point.sent > 0 ? "4px" : "0px",
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground">
                      {point.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem dados de envio no período
              </p>
            )}
          </CardContent>
        </Card>

        {/* Log de envios */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Envios recentes ({total})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : (
              <>
                <div className="border rounded-lg overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Destinatário</TableHead>
                        <TableHead className="text-xs">Campanha</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Enviado</TableHead>
                        <TableHead className="text-xs text-center">
                          Aberturas
                        </TableHead>
                        <TableHead className="text-xs text-center">
                          Cliques
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const statusCfg =
                          STATUS_CONFIG[row.status] || {
                            label: row.status,
                            className: "bg-muted text-muted-foreground",
                          };
                        return (
                          <TableRow
                            key={row.id}
                            className={
                              row.html
                                ? "cursor-pointer hover:bg-accent/50"
                                : ""
                            }
                            onClick={() => handleRowClick(row)}
                          >
                            <TableCell className="text-xs font-medium">
                              {row.email}
                              {row.lead?.name && (
                                <span className="block text-[10px] text-muted-foreground">
                                  {row.lead.name}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.campaign?.name || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={`${statusCfg.className} text-[10px]`}
                              >
                                {statusCfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtDate(row.sent_at)}
                            </TableCell>
                            <TableCell className="text-xs text-center tabular-nums">
                              {row.open_count || 0}
                            </TableCell>
                            <TableCell className="text-xs text-center tabular-nums">
                              {row.click_count || 0}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {rows.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center text-muted-foreground py-8"
                          >
                            Nenhum envio registrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="flex justify-end items-center gap-2 mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {page + 1}/{totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline do email — abre ao clicar numa linha com html */}
      <EmailTimelineModal
        open={!!selectedRow}
        onOpenChange={(open) => !open && setSelectedRow(null)}
        metadata={selectedRow ? buildMetadata(selectedRow) : null}
      />
    </AppLayout>
  );
};

export default MarketingDashboard;
