import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useNFSeEmissions,
  useLeadPaidPayments,
  useEmitNFSe,
  useCheckNFSeStatus,
  useCancelNFSe,
  useUpdateLeadFiscal,
  getNFSeResultStatus,
  getNFSeResultEmissionId,
  type NFSeEmission,
  type ExtractedCNPJData,
} from "@/hooks/useNFSe";
import { CNPJCardDropzone } from "./CNPJCardDropzone";
import {
  Ban,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Receipt,
  RefreshCw,
  Save,
  User,
  XCircle,
} from "lucide-react";

interface NFSeTabProps {
  leadId: string;
  lead?: Record<string, any> | null;
}

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  processando: { label: "Processando", className: "bg-yellow-100 text-yellow-700 border-0" },
  autorizado: { label: "Autorizado", className: "bg-green-100 text-green-700 border-0" },
  erro: { label: "Erro", className: "bg-red-100 text-red-700 border-0" },
  cancelado: { label: "Cancelado", className: "bg-gray-100 text-gray-600 border-0" },
};

function NFSeStatusBadge({ status }: { status?: string | null }) {
  const config = STATUS_CONFIG[status || ""] || {
    label: status || "—",
    className: "bg-gray-100 text-gray-600 border-0",
  };
  return <Badge className={config.className}>{config.label}</Badge>;
}

const MAX_POLL_ATTEMPTS = 30; // 30 x 10s = 5 min

export function NFSeTab({ leadId, lead }: NFSeTabProps) {
  // ── Dados fiscais do lead ────────────────────────────────────────────────
  const [fiscalForm, setFiscalForm] = useState({
    cpf_cnpj: "",
    nfse_email: "",
    company_name: "",
    address: "",
    cep: "",
    city_name: "",
    state: "",
  });

  useEffect(() => {
    if (!lead) return;
    setFiscalForm({
      cpf_cnpj: lead.cpf_cnpj || "",
      nfse_email: lead.nfse_email || "",
      company_name: lead.company_name || "",
      address: lead.address || "",
      cep: lead.cep || "",
      city_name: lead.city_name || "",
      state: lead.state || "",
    });
  }, [lead]);

  const updateLeadFiscal = useUpdateLeadFiscal(leadId);

  const setField = (field: keyof typeof fiscalForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFiscalForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSaveFiscal = async () => {
    try {
      await updateLeadFiscal.mutateAsync({
        cpf_cnpj: fiscalForm.cpf_cnpj || null,
        nfse_email: fiscalForm.nfse_email || null,
        company_name: fiscalForm.company_name || null,
        address: fiscalForm.address || null,
        cep: fiscalForm.cep || null,
        city_name: fiscalForm.city_name || null,
        state: fiscalForm.state || null,
      });
      toast.success("Dados fiscais salvos!");
    } catch (error: any) {
      toast.error("Erro ao salvar dados fiscais", { description: error?.message });
    }
  };

  const handleCNPJExtracted = (data: ExtractedCNPJData) => {
    setFiscalForm((prev) => ({
      ...prev,
      cpf_cnpj: data.cnpj || prev.cpf_cnpj,
      company_name: data.razao_social || prev.company_name,
      address:
        [data.logradouro, data.numero, data.complemento, data.bairro]
          .filter(Boolean)
          .join(", ") || prev.address,
      cep: data.cep || prev.cep,
      city_name: data.cidade || prev.city_name,
      state: data.uf || prev.state,
    }));
  };

  // ── Historico de notas ───────────────────────────────────────────────────
  const { data: emissions, isLoading: emissionsLoading } = useNFSeEmissions(leadId);
  const checkStatus = useCheckNFSeStatus();
  const cancelNFSe = useCancelNFSe();

  const [cancelTarget, setCancelTarget] = useState<NFSeEmission | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const handleCheckStatus = async (emission: NFSeEmission) => {
    try {
      const data = await checkStatus.mutateAsync({
        emissionId: emission.id,
        dealPaymentId: emission.deal_payment_id,
        leadId,
      });
      const status = getNFSeResultStatus(data);
      if (status === "autorizado") {
        toast.success("NFS-e autorizada!");
      } else if (status === "erro") {
        toast.error("Erro na emissao", {
          description: data?.error_message || data?.message || "Veja os detalhes no historico.",
        });
      } else {
        toast.info("Ainda processando", {
          description: "A prefeitura ainda nao autorizou a nota. Tente de novo em instantes.",
        });
      }
    } catch (error: any) {
      toast.error("Erro ao verificar status", { description: error?.message });
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 15) {
      toast.error("Motivo muito curto", {
        description: "O motivo do cancelamento deve ter no minimo 15 caracteres.",
      });
      return;
    }
    try {
      await cancelNFSe.mutateAsync({
        emissionId: cancelTarget.id,
        motivo: cancelReason,
        leadId,
      });
      toast.success("NFS-e cancelada!");
      setCancelTarget(null);
      setCancelReason("");
    } catch (error: any) {
      toast.error("Erro ao cancelar NFS-e", { description: error?.message });
    }
  };

  // ── Emissao ──────────────────────────────────────────────────────────────
  const [showEmitModal, setShowEmitModal] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const { data: paidPayments, isLoading: paymentsLoading } = useLeadPaidPayments(
    showEmitModal ? leadId : undefined
  );
  const emitNFSe = useEmitNFSe();

  // Polling client-side (fallback quando o server devolve "processando")
  const [pollingEmissionId, setPollingEmissionId] = useState<string | null>(null);
  const pollAttemptsRef = useRef(0);
  const checkStatusRef = useRef(checkStatus);
  checkStatusRef.current = checkStatus;

  useEffect(() => {
    if (!pollingEmissionId) return;
    pollAttemptsRef.current = 0;

    const interval = setInterval(async () => {
      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current > MAX_POLL_ATTEMPTS) {
        setPollingEmissionId(null);
        toast.info("NFS-e ainda em processamento", {
          description: "Use o botao 'Verificar' no historico pra checar mais tarde.",
        });
        return;
      }
      try {
        const data = await checkStatusRef.current.mutateAsync({
          emissionId: pollingEmissionId,
          leadId,
        });
        const status = getNFSeResultStatus(data);
        if (status && status !== "processando") {
          setPollingEmissionId(null);
          if (status === "autorizado") {
            toast.success("NFS-e autorizada!", {
              description: data?.nfse_number ? `Nota nº ${data.nfse_number}` : undefined,
            });
          } else if (status === "erro") {
            toast.error("Erro na emissao da NFS-e", {
              description: data?.error_message || data?.message || "Veja o historico de notas.",
            });
          }
        }
      } catch {
        // erro transitorio: continua tentando ate o limite
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [pollingEmissionId, leadId]);

  const handleEmit = async () => {
    if (!selectedPaymentId) return;
    try {
      const data = await emitNFSe.mutateAsync({
        dealPaymentId: selectedPaymentId,
        leadId,
      });
      const status = getNFSeResultStatus(data);
      const emissionId = getNFSeResultEmissionId(data);

      setShowEmitModal(false);
      setSelectedPaymentId(null);

      if (status === "autorizado") {
        toast.success("NFS-e autorizada!", {
          description: data?.nfse_number ? `Nota nº ${data.nfse_number}` : undefined,
        });
      } else if (status === "erro") {
        toast.error("Erro na emissao da NFS-e", {
          description: data?.error_message || data?.message || "Veja o historico de notas.",
        });
      } else {
        toast.info("NFS-e em processamento", {
          description: "Vamos checar o status automaticamente a cada 10 segundos.",
        });
        if (emissionId) setPollingEmissionId(emissionId);
      }
    } catch (error: any) {
      toast.error("Erro ao emitir NFS-e", { description: error?.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* ═══ Secao 1: Dados fiscais do lead ═══ */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-5 w-5 text-purple-500" />
            Dados Fiscais do Cliente (Tomador)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CNPJCardDropzone onExtracted={handleCNPJExtracted} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nfse-cpf-cnpj">CPF / CNPJ *</Label>
              <Input
                id="nfse-cpf-cnpj"
                placeholder="00.000.000/0000-00"
                value={fiscalForm.cpf_cnpj}
                onChange={setField("cpf_cnpj")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nfse-email">Email pra receber a nota</Label>
              <Input
                id="nfse-email"
                type="email"
                placeholder="financeiro@cliente.com"
                value={fiscalForm.nfse_email}
                onChange={setField("nfse_email")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nfse-company">Razao social (se pessoa juridica)</Label>
            <Input
              id="nfse-company"
              placeholder="Empresa Cliente LTDA"
              value={fiscalForm.company_name}
              onChange={setField("company_name")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nfse-address">Endereco</Label>
            <Input
              id="nfse-address"
              placeholder="Rua Exemplo, 123, Centro"
              value={fiscalForm.address}
              onChange={setField("address")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nfse-cep">CEP</Label>
              <Input
                id="nfse-cep"
                placeholder="00000-000"
                value={fiscalForm.cep}
                onChange={setField("cep")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nfse-city">Cidade</Label>
              <Input
                id="nfse-city"
                placeholder="Sao Paulo"
                value={fiscalForm.city_name}
                onChange={setField("city_name")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nfse-uf">UF</Label>
              <Input
                id="nfse-uf"
                placeholder="SP"
                maxLength={2}
                value={fiscalForm.state}
                onChange={setField("state")}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveFiscal} disabled={updateLeadFiscal.isPending}>
              {updateLeadFiscal.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar dados fiscais
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Secao 2: Historico de notas ═══ */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-5 w-5 text-green-500" />
              Notas Fiscais Emitidas
            </CardTitle>
            <Button onClick={() => setShowEmitModal(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Emitir nota
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {emissionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !emissions || emissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma nota fiscal emitida pra este cliente ainda.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numero</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emissions.map((emission) => (
                    <TableRow key={emission.id}>
                      <TableCell className="font-medium">
                        {emission.nfse_number || "—"}
                      </TableCell>
                      <TableCell>
                        {emission.created_at
                          ? format(new Date(emission.created_at), "dd/MM/yyyy HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell>{formatCurrency(emission.valor_servico)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <NFSeStatusBadge status={emission.focus_nfe_status} />
                          {emission.focus_nfe_status === "processando" &&
                            pollingEmissionId === emission.id && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-600" />
                            )}
                        </div>
                        {emission.focus_nfe_status === "erro" && emission.error_message && (
                          <p
                            className="text-xs text-red-600 mt-1 max-w-[240px] truncate"
                            title={emission.error_message}
                          >
                            {emission.error_message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {emission.pdf_url && (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={emission.pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Ver PDF da nota"
                              >
                                <Download className="h-3.5 w-3.5 mr-1" />
                                PDF
                              </a>
                            </Button>
                          )}
                          {emission.xml_url && (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={emission.xml_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Ver XML fiscal"
                              >
                                <FileText className="h-3.5 w-3.5 mr-1" />
                                XML
                              </a>
                            </Button>
                          )}
                          {emission.focus_nfe_status === "processando" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCheckStatus(emission)}
                              disabled={checkStatus.isPending}
                            >
                              <RefreshCw
                                className={cn(
                                  "h-3.5 w-3.5 mr-1",
                                  checkStatus.isPending && "animate-spin"
                                )}
                              />
                              Verificar
                            </Button>
                          )}
                          {emission.focus_nfe_status === "autorizado" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                setCancelTarget(emission);
                                setCancelReason("");
                              }}
                            >
                              <Ban className="h-3.5 w-3.5 mr-1" />
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Modal de emissao ═══ */}
      <Dialog
        open={showEmitModal}
        onOpenChange={(open) => {
          setShowEmitModal(open);
          if (!open) setSelectedPaymentId(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Emitir NFS-e</DialogTitle>
            <DialogDescription>
              Selecione o pagamento pago que vai gerar a nota fiscal de servico.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2 max-h-[320px] overflow-y-auto">
            {paymentsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !paidPayments || paidPayments.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <XCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhum pagamento pago encontrado pra este cliente.
                <p className="text-xs mt-1">
                  Marque um pagamento como recebido antes de emitir a nota.
                </p>
              </div>
            ) : (
              paidPayments.map((payment) => {
                const alreadyEmitted = emissions?.some(
                  (e) =>
                    e.deal_payment_id === payment.id &&
                    (e.focus_nfe_status === "autorizado" || e.focus_nfe_status === "processando")
                );
                const isSelected = selectedPaymentId === payment.id;
                return (
                  <button
                    key={payment.id}
                    type="button"
                    onClick={() => setSelectedPaymentId(payment.id)}
                    className={cn(
                      "w-full text-left border rounded-lg p-3 transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:border-primary/40 hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {payment.description || "Pagamento"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {(payment.deal as any)?.product?.name || "Servico"}
                          {payment.paid_at &&
                            ` • Pago em ${format(new Date(payment.paid_at), "dd/MM/yyyy")}`}
                        </p>
                        {alreadyEmitted && (
                          <Badge className="bg-blue-100 text-blue-700 border-0 mt-1 text-[10px]">
                            Ja tem nota emitida
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold text-sm">
                          {formatCurrency(payment.amount)}
                        </span>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmitModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEmit} disabled={!selectedPaymentId || emitNFSe.isPending}>
              {emitNFSe.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Emitindo... (pode levar ate 90s)
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4 mr-2" />
                  Emitir NFS-e
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Modal de cancelamento ═══ */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Cancelar NFS-e</DialogTitle>
            <DialogDescription>
              {cancelTarget?.nfse_number
                ? `Cancelar a nota nº ${cancelTarget.nfse_number}. `
                : ""}
              Informe o motivo do cancelamento (minimo 15 caracteres).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="nfse-cancel-reason">Motivo *</Label>
            <Textarea
              id="nfse-cancel-reason"
              rows={3}
              placeholder="Ex: Nota emitida em duplicidade. Cancelamento solicitado pelo cliente."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <p
              className={cn(
                "text-xs",
                cancelReason.trim().length < 15 ? "text-red-500" : "text-muted-foreground"
              )}
            >
              {cancelReason.trim().length}/15 caracteres minimos
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelNFSe.isPending || cancelReason.trim().length < 15}
            >
              {cancelNFSe.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Ban className="h-4 w-4 mr-2" />
              )}
              Cancelar nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
