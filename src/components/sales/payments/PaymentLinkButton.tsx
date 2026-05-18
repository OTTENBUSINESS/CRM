import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGeneratePaymentLink } from "@/hooks/useDealPayments";
import { useToast } from "@/hooks/use-toast";
import { Link, Copy, Check, Loader2, ExternalLink } from "lucide-react";
import type { DealPayment } from "@/types/payment.types";

interface PaymentLinkButtonProps {
  payment: DealPayment;
  variant?: "default" | "compact";
}

export function PaymentLinkButton({
  payment,
  variant = "default",
}: PaymentLinkButtonProps) {
  const { toast } = useToast();
  const generateLink = useGeneratePaymentLink();
  const [copied, setCopied] = useState(false);

  const handleGenerateLink = async () => {
    try {
      await generateLink.mutateAsync({ paymentId: payment.id, dealId: payment.deal_id });
      toast({
        title: "Sucesso",
        description: "Link de pagamento gerado!",
      });
    } catch (error) {
      console.error("Erro ao gerar link:", error);
      toast({
        title: "Erro",
        description: "Erro ao gerar link de pagamento",
        variant: "destructive",
      });
    }
  };

  const handleCopyLink = async () => {
    if (!payment.payment_link) return;

    try {
      await navigator.clipboard.writeText(payment.payment_link);
      setCopied(true);
      toast({
        title: "Copiado!",
        description: "Link copiado para a area de transferencia",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Erro",
        description: "Nao foi possivel copiar o link",
        variant: "destructive",
      });
    }
  };

  // If payment already has a link
  if (payment.payment_link) {
    if (variant === "compact") {
      return (
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copiar link</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                asChild
              >
                <a
                  href={payment.payment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Abrir link</TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="gap-2"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-green-500" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copiar Link
            </>
          )}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" asChild>
              <a
                href={payment.payment_link}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Abrir em nova aba</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  // No link yet - show generate button
  const canGenerateLink =
    payment.status === "pending" &&
    payment.gateway === "asaas";

  if (!canGenerateLink) {
    if (payment.gateway === "manual") {
      return (
        <span className="text-sm text-muted-foreground">
          Pagamento manual
        </span>
      );
    }
    return null;
  }

  if (variant === "compact") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleGenerateLink}
            disabled={generateLink.isPending}
          >
            {generateLink.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Gerar link de pagamento</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleGenerateLink}
      disabled={generateLink.isPending}
      className="gap-2"
    >
      {generateLink.isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Gerando...
        </>
      ) : (
        <>
          <Link className="h-4 w-4" />
          Gerar Link
        </>
      )}
    </Button>
  );
}
