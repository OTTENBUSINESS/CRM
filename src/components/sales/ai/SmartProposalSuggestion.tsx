import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePlaybookContent } from "@/hooks/useSalesPlaybook";
import {
  Sparkles,
  FileText,
  DollarSign,
  Percent,
  CreditCard,
  Target,
  TrendingUp,
  Gift,
  Clock,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface ProposalSuggestion {
  recommended_product: {
    id: string;
    name: string;
    original_price: number;
  };
  suggested_price: number;
  discount_percent: number;
  discount_reason: string;
  payment_suggestion: {
    method: string;
    installments: number;
    installment_value: number;
  };
  closing_arguments: string[];
  urgency_tactics: string[];
  bonus_suggestions: string[];
  win_probability: number;
  reasoning: string;
}

interface SmartProposalSuggestionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string; // deprecated, use leadId
  leadId?: string;
  contactName?: string; // deprecated, use leadName
  leadName?: string;
  productId?: string;
  onApply?: (proposal: ProposalSuggestion) => void;
}

export function SmartProposalSuggestion({
  open,
  onOpenChange,
  contactId,
  leadId,
  contactName,
  leadName,
  productId,
  onApply,
}: SmartProposalSuggestionProps) {
  // Suporta tanto leadId quanto contactId para compatibilidade
  const resolvedLeadId = leadId || contactId;
  const resolvedLeadName = leadName || contactName || 'este lead';
  const { toast } = useToast();
  const { data: playbookContent } = usePlaybookContent();
  const [isLoading, setIsLoading] = useState(false);
  const [proposal, setProposal] = useState<ProposalSuggestion | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!resolvedLeadId) return;

    setIsLoading(true);
    setProposal(null);

    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('suggest-proposal', {
        body: {
          lead_id: resolvedLeadId,
          product_id: productId,
          playbook_context: playbookContent || undefined,
        },
      });

      if (invokeError) throw invokeError;

      setProposal(result.proposal);
    } catch (error: any) {
      toast({
        title: "Erro ao gerar proposta",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods: Record<string, string> = {
      pix: "PIX",
      credit_card: "Cartão de Crédito",
      bank_slip: "Boleto",
    };
    return methods[method] || method;
  };

  const getProbabilityColor = (probability: number) => {
    if (probability >= 70) return "text-green-600";
    if (probability >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            Proposta Inteligente
          </DialogTitle>
          <DialogDescription>
            Sugestão de proposta otimizada para {resolvedLeadName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {!proposal && !isLoading && (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-blue-300 mb-4" />
              <p className="text-muted-foreground mb-4">
                A IA irá analisar o perfil do lead e sugerir a melhor proposta
              </p>
              <Button onClick={handleGenerate}>
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar Proposta
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {proposal && !isLoading && (
            <>
              {/* Win Probability */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    Probabilidade de Fechamento
                  </span>
                  <span className={cn("text-2xl font-bold", getProbabilityColor(proposal.win_probability))}>
                    {proposal.win_probability}%
                  </span>
                </div>
                <Progress value={proposal.win_probability} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">{proposal.reasoning}</p>
              </div>

              {/* Product & Price */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-1">Produto Recomendado</p>
                  <p className="font-semibold">{proposal.recommended_product.name}</p>
                  <p className="text-sm text-muted-foreground line-through">
                    {formatCurrency(proposal.recommended_product.original_price)}
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-xs text-green-700 mb-1">Preço Sugerido</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(proposal.suggested_price)}
                  </p>
                  <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 mt-1">
                    <Percent className="h-3 w-3 mr-1" />
                    {proposal.discount_percent}% OFF
                  </Badge>
                </div>
              </div>

              {/* Discount Reason */}
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-xs font-medium text-amber-700 mb-1">Justificativa do Desconto</p>
                <p className="text-sm">{proposal.discount_reason}</p>
              </div>

              {/* Payment */}
              <div className="p-4 bg-white rounded-lg border">
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-500" />
                  Forma de Pagamento Sugerida
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant="outline">{getPaymentMethodLabel(proposal.payment_suggestion.method)}</Badge>
                    {proposal.payment_suggestion.installments > 1 && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {proposal.payment_suggestion.installments}x de{" "}
                        {formatCurrency(proposal.payment_suggestion.installment_value)}
                      </p>
                    )}
                  </div>
                  <DollarSign className="h-8 w-8 text-green-500" />
                </div>
              </div>

              {/* Closing Arguments */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Target className="h-4 w-4 text-purple-500" />
                  Argumentos de Fechamento
                </p>
                <div className="space-y-2">
                  {proposal.closing_arguments.map((arg, i) => (
                    <div
                      key={i}
                      className="p-2 bg-purple-50 rounded border border-purple-200 flex items-start justify-between gap-2"
                    >
                      <p className="text-sm">{arg}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={() => handleCopy(arg, `arg-${i}`)}
                      >
                        {copied === `arg-${i}` ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Urgency Tactics */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-red-500" />
                  Táticas de Urgência
                </p>
                <div className="flex flex-wrap gap-2">
                  {proposal.urgency_tactics.map((tactic, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="bg-red-50 text-red-700 border-red-200 cursor-pointer hover:bg-red-100"
                      onClick={() => handleCopy(tactic, `urg-${i}`)}
                    >
                      {copied === `urg-${i}` ? <Check className="h-3 w-3 mr-1" /> : null}
                      {tactic}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Bonus Suggestions */}
              {proposal.bonus_suggestions.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Gift className="h-4 w-4 text-pink-500" />
                    Bônus Sugeridos
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {proposal.bonus_suggestions.map((bonus, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="bg-pink-50 text-pink-700 border-pink-200"
                      >
                        <Gift className="h-3 w-3 mr-1" />
                        {bonus}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={handleGenerate} className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerar
                </Button>
                {onApply && (
                  <Button
                    onClick={() => {
                      onApply(proposal);
                      onOpenChange(false);
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Aplicar Proposta
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
