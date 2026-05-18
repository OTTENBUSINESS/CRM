import { useState, useMemo, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import {
  MessageSquare,
  Search,
  ChevronRight,
  Phone,
  PhoneOff,
  Send,
  Eye,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { sendWhatsAppMessage } from "@/services/whatsappService";
import { supabase } from "@/lib/supabase";
import type { PipelineColumn, Deal } from "@/types/sales.types";

interface LeadRecipient {
  dealId: string;
  leadId: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  stageName: string;
  stageId: string;
}

interface BulkWhatsAppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: PipelineColumn[];
}

const TEMPLATE_VARIABLES = [
  { key: "{{nome}}", label: "Nome" },
  { key: "{{empresa}}", label: "Empresa" },
  { key: "{{email}}", label: "Email" },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function replaceVariables(
  template: string,
  lead: LeadRecipient
): string {
  return template
    .replace(/\{\{nome\}\}/g, lead.name || "")
    .replace(/\{\{empresa\}\}/g, lead.company || "")
    .replace(/\{\{email\}\}/g, lead.email || "");
}

export function BulkWhatsAppModal({
  open,
  onOpenChange,
  columns,
}: BulkWhatsAppModalProps) {
  const { toast } = useToast();

  // Step management
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Selection
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState("");
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  // Step 2: Compose
  const [message, setMessage] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [showPreview, setShowPreview] = useState(false);

  // Sending state
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0, errors: 0 });
  const abortRef = useRef(false);

  // Build flat recipient list from pipeline columns (exclude won/lost stages)
  const allRecipients = useMemo(() => {
    const recipients: LeadRecipient[] = [];
    for (const col of columns) {
      if (col.stage.is_won || col.stage.is_lost) continue;
      for (const deal of col.deals) {
        if (!deal.lead) continue;
        recipients.push({
          dealId: deal.id,
          leadId: deal.lead_id,
          name: deal.lead.name || deal.title || "",
          phone: deal.lead.phone || null,
          email: deal.lead.email || null,
          company: deal.lead.company_name || null,
          stageName: col.stage.name,
          stageId: col.stage.id,
        });
      }
    }
    return recipients;
  }, [columns]);

  // Group by stage for display
  const stageGroups = useMemo(() => {
    const searchLower = searchFilter.toLowerCase().trim();
    const groups: { stageId: string; stageName: string; recipients: LeadRecipient[] }[] = [];

    for (const col of columns) {
      if (col.stage.is_won || col.stage.is_lost) continue;
      const filtered = allRecipients
        .filter((r) => r.stageId === col.stage.id)
        .filter((r) => {
          if (!searchLower) return true;
          return (
            r.name.toLowerCase().includes(searchLower) ||
            (r.phone || "").includes(searchLower) ||
            (r.company || "").toLowerCase().includes(searchLower)
          );
        });
      if (filtered.length > 0) {
        groups.push({
          stageId: col.stage.id,
          stageName: col.stage.name,
          recipients: filtered,
        });
      }
    }
    return groups;
  }, [columns, allRecipients, searchFilter]);

  const selectedRecipients = useMemo(
    () => allRecipients.filter((r) => selectedLeadIds.has(r.dealId) && r.phone),
    [allRecipients, selectedLeadIds]
  );

  const selectedCount = selectedRecipients.length;

  // Toggle helpers
  const toggleLead = useCallback((dealId: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  }, []);

  const toggleStage = useCallback(
    (stageId: string) => {
      const stageRecipients = allRecipients.filter(
        (r) => r.stageId === stageId && r.phone
      );
      const allSelected = stageRecipients.every((r) => selectedLeadIds.has(r.dealId));

      setSelectedLeadIds((prev) => {
        const next = new Set(prev);
        for (const r of stageRecipients) {
          if (allSelected) next.delete(r.dealId);
          else next.add(r.dealId);
        }
        return next;
      });
    },
    [allRecipients, selectedLeadIds]
  );

  const toggleExpandStage = useCallback((stageId: string) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }, []);

  // Insert variable at cursor
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const insertVariable = (variable: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setMessage((prev) => prev + variable);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newMsg = message.slice(0, start) + variable + message.slice(end);
    setMessage(newMsg);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + variable.length;
    }, 0);
  };

  // Preview message
  const previewMessage = useMemo(() => {
    if (selectedRecipients.length === 0) return message;
    return replaceVariables(message, selectedRecipients[0]);
  }, [message, selectedRecipients]);

  // Send messages
  const handleSend = async () => {
    if (selectedRecipients.length === 0 || !message.trim()) return;

    setIsSending(true);
    abortRef.current = false;
    const total = selectedRecipients.length;
    setSendProgress({ sent: 0, total, errors: 0 });

    let sent = 0;
    let errors = 0;

    for (let i = 0; i < selectedRecipients.length; i++) {
      if (abortRef.current) break;

      const recipient = selectedRecipients[i];
      const personalizedMsg = replaceVariables(message, recipient);

      try {
        const result = await sendWhatsAppMessage({
          phone: recipient.phone!,
          message: personalizedMsg,
        });

        if (result.success) {
          sent++;
          // Save to whatsapp_messages for traceability
          try {
            await supabase.from("whatsapp_messages").insert({
              lead_id: recipient.leadId,
              direction: "outbound",
              message_type: "text",
              content: personalizedMsg,
              status: "sent",
              sender_name: "Disparo em massa",
              metadata: { bulk_send: true },
            });
          } catch (_e) {
            // Non-critical, don't count as error
          }
        } else {
          errors++;
        }
      } catch (_e) {
        errors++;
      }

      setSendProgress({ sent, total, errors });

      // Delay between messages (skip after last)
      if (i < selectedRecipients.length - 1 && !abortRef.current) {
        await delay(delaySeconds * 1000);
      }
    }

    setIsSending(false);

    toast({
      title: abortRef.current ? "Envio cancelado" : "Envio concluído",
      description: `${sent} enviadas com sucesso${errors > 0 ? `, ${errors} erros` : ""}`,
      variant: errors > 0 ? "destructive" : "default",
    });

    if (!abortRef.current && errors === 0) {
      handleClose();
    }
  };

  const handleCancel = () => {
    abortRef.current = true;
  };

  const handleClose = () => {
    if (isSending) return;
    setStep(1);
    setSelectedLeadIds(new Set());
    setSearchFilter("");
    setExpandedStages(new Set());
    setMessage("");
    setShowPreview(false);
    setSendProgress({ sent: 0, total: 0, errors: 0 });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            Disparar WhatsApp em Massa
            {step === 2 && (
              <Badge variant="secondary" className="ml-2">
                {selectedCount} destinatários
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm text-slate-500 -mt-1">
          <span className={cn("font-medium", step === 1 && "text-primary")}>
            1. Selecionar
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className={cn("font-medium", step === 2 && "text-primary")}>
            2. Compor e enviar
          </span>
        </div>

        {/* Step 1: Select recipients */}
        {step === 1 && (
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome, telefone, empresa..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-9"
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Stage groups */}
            <ScrollArea className="flex-1 min-h-0 max-h-[50vh] border rounded-lg">
              <div className="p-2 space-y-1">
                {stageGroups.map((group) => {
                  const withPhone = group.recipients.filter((r) => r.phone);
                  const allSelected =
                    withPhone.length > 0 &&
                    withPhone.every((r) => selectedLeadIds.has(r.dealId));
                  const someSelected =
                    !allSelected &&
                    withPhone.some((r) => selectedLeadIds.has(r.dealId));
                  const isExpanded = expandedStages.has(group.stageId);

                  return (
                    <Collapsible
                      key={group.stageId}
                      open={isExpanded}
                      onOpenChange={() => toggleExpandStage(group.stageId)}
                    >
                      <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-slate-50">
                        <Checkbox
                          checked={allSelected}
                          // @ts-ignore - indeterminate supported
                          indeterminate={someSelected}
                          onCheckedChange={() => toggleStage(group.stageId)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 text-slate-400 transition-transform",
                              isExpanded && "rotate-90"
                            )}
                          />
                          <span className="font-medium text-sm">
                            {group.stageName}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {withPhone.length}/{group.recipients.length}
                          </Badge>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        <div className="ml-8 space-y-0.5 pb-1">
                          {group.recipients.map((r) => {
                            const hasPhone = !!r.phone;
                            return (
                              <TooltipProvider key={r.dealId}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className={cn(
                                        "flex items-center gap-2 py-1 px-2 rounded text-sm",
                                        hasPhone
                                          ? "hover:bg-slate-50 cursor-pointer"
                                          : "opacity-50 cursor-not-allowed"
                                      )}
                                      onClick={() =>
                                        hasPhone && toggleLead(r.dealId)
                                      }
                                    >
                                      <Checkbox
                                        checked={selectedLeadIds.has(r.dealId)}
                                        disabled={!hasPhone}
                                        onCheckedChange={() =>
                                          hasPhone && toggleLead(r.dealId)
                                        }
                                      />
                                      <span className="flex-1 truncate">
                                        {r.name}
                                      </span>
                                      {r.company && (
                                        <span className="text-xs text-slate-400 truncate max-w-[120px]">
                                          {r.company}
                                        </span>
                                      )}
                                      {hasPhone ? (
                                        <Phone className="h-3 w-3 text-green-500 flex-shrink-0" />
                                      ) : (
                                        <PhoneOff className="h-3 w-3 text-red-400 flex-shrink-0" />
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  {!hasPhone && (
                                    <TooltipContent>
                                      Sem telefone cadastrado
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}

                {stageGroups.length === 0 && (
                  <p className="text-center text-sm text-slate-400 py-8">
                    Nenhum lead encontrado
                  </p>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-slate-500">
                {selectedCount} lead{selectedCount !== 1 ? "s" : ""} selecionado
                {selectedCount !== 1 ? "s" : ""}
              </span>
              <Button
                onClick={() => setStep(2)}
                disabled={selectedCount === 0}
              >
                Próximo
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Compose and send */}
        {step === 2 && !isSending && (
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            {/* Warning for large selections */}
            {selectedCount > 50 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Enviando para {selectedCount} leads. O envio pode levar{" "}
                {Math.ceil((selectedCount * delaySeconds) / 60)} min.
              </div>
            )}

            {/* Message textarea */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                Mensagem
              </label>
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Digite sua mensagem..."
                rows={5}
                className="resize-none"
              />
            </div>

            {/* Template variables */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500">Variáveis:</span>
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => insertVariable(v.key)}
                  className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  {v.key}
                </button>
              ))}
            </div>

            {/* Delay slider */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600 whitespace-nowrap">
                Delay: {delaySeconds}s
              </span>
              <Slider
                value={[delaySeconds]}
                onValueChange={([v]) => setDelaySeconds(v)}
                min={1}
                max={5}
                step={0.5}
                className="flex-1"
              />
            </div>

            {/* Preview toggle */}
            {message.trim() && selectedRecipients.length > 0 && (
              <div>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showPreview ? "Ocultar preview" : "Ver preview"}
                </button>
                {showPreview && (
                  <div className="mt-2 p-3 rounded-md bg-slate-50 border text-sm whitespace-pre-wrap">
                    <p className="text-xs text-slate-400 mb-1">
                      Preview ({selectedRecipients[0].name}):
                    </p>
                    {previewMessage}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Voltar
              </Button>
              <Button
                onClick={handleSend}
                disabled={!message.trim() || selectedCount === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                <Send className="h-4 w-4 mr-1.5" />
                Enviar para {selectedCount} lead{selectedCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {/* Sending progress */}
        {isSending && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 text-green-600 animate-spin" />
            <div className="text-center">
              <p className="font-medium text-slate-800">
                Enviando mensagens...
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {sendProgress.sent + sendProgress.errors}/{sendProgress.total}
              </p>
            </div>

            <div className="w-full max-w-sm">
              <Progress
                value={
                  ((sendProgress.sent + sendProgress.errors) /
                    sendProgress.total) *
                  100
                }
                className="h-2"
              />
            </div>

            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {sendProgress.sent}
              </span>
              {sendProgress.errors > 0 && (
                <span className="flex items-center gap-1 text-red-500">
                  <XCircle className="h-3.5 w-3.5" />
                  {sendProgress.errors}
                </span>
              )}
            </div>

            <Button variant="destructive" size="sm" onClick={handleCancel}>
              Cancelar envio
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
