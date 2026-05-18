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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePlaybookContent } from "@/hooks/useSalesPlaybook";
import {
  Sparkles,
  Send,
  Copy,
  Check,
  MessageSquare,
  UserPlus,
  RefreshCw,
  Shield,
  FileText,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type MessageType = "first_contact" | "follow_up" | "objection_handling" | "proposal" | "reengagement";

interface GeneratedMessage {
  message: string;
  tone: string;
  call_to_action: string;
  best_send_time: string;
  alternative_messages: string[];
}

interface AIMessageGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string; // deprecated, use leadId
  leadId?: string;
  contactName?: string; // deprecated, use leadName
  leadName?: string;
  contactPhone?: string; // deprecated, use leadPhone
  leadPhone?: string;
  onSend?: (message: string) => void;
}

const MESSAGE_TYPES: { value: MessageType; label: string; icon: React.ElementType; description: string }[] = [
  {
    value: "first_contact",
    label: "Primeiro Contato",
    icon: UserPlus,
    description: "Mensagem de apresentação inicial",
  },
  {
    value: "follow_up",
    label: "Follow-up",
    icon: RefreshCw,
    description: "Retomar conversa pausada",
  },
  {
    value: "objection_handling",
    label: "Contornar Objeção",
    icon: Shield,
    description: "Responder a objeções identificadas",
  },
  {
    value: "proposal",
    label: "Proposta",
    icon: FileText,
    description: "Apresentar proposta comercial",
  },
  {
    value: "reengagement",
    label: "Reengajamento",
    icon: Clock,
    description: "Reativar lead frio",
  },
];

export function AIMessageGenerator({
  open,
  onOpenChange,
  contactId,
  leadId,
  contactName,
  leadName,
  contactPhone,
  leadPhone,
  onSend,
}: AIMessageGeneratorProps) {
  // Suporta tanto leadId quanto contactId para compatibilidade
  const resolvedLeadId = leadId || contactId;
  const resolvedLeadName = leadName || contactName || 'este lead';
  const resolvedLeadPhone = leadPhone || contactPhone;

  const { toast } = useToast();
  const { data: playbookContent } = usePlaybookContent();
  const [selectedType, setSelectedType] = useState<MessageType>("follow_up");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!resolvedLeadId) return;

    setIsGenerating(true);
    setGenerated(null);
    setSelectedMessage("");

    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('generate-sales-message', {
        body: {
          lead_id: resolvedLeadId,
          message_type: selectedType,
          playbook_context: playbookContent || undefined,
        },
      });

      if (invokeError) throw invokeError;

      setGenerated(result);
      setSelectedMessage(result.message);
    } catch (error: any) {
      toast({
        title: "Erro ao gerar mensagem",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Mensagem copiada!",
      description: "Cole no WhatsApp para enviar",
    });
  };

  const handleSendWhatsApp = () => {
    if (resolvedLeadPhone) {
      const phone = resolvedLeadPhone.replace(/\D/g, "");
      const url = `https://wa.me/55${phone}?text=${encodeURIComponent(selectedMessage)}`;
      window.open(url, "_blank");
      onOpenChange(false);
    }
  };

  const handleSelectAlternative = (msg: string) => {
    setSelectedMessage(msg);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Gerar Mensagem com IA
          </DialogTitle>
          <DialogDescription>
            Crie mensagens personalizadas para {resolvedLeadName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Message Type Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Tipo de Mensagem</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MESSAGE_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    onClick={() => setSelectedType(type.value)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all",
                      selectedType === type.value
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 hover:border-purple-300 hover:bg-purple-50/50"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 mb-1",
                        selectedType === type.value ? "text-purple-500" : "text-gray-400"
                      )}
                    />
                    <p className="text-sm font-medium">{type.label}</p>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar Mensagem
              </>
            )}
          </Button>

          {/* Loading State */}
          {isGenerating && (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-6 w-1/3" />
            </div>
          )}

          {/* Generated Message */}
          {generated && !isGenerating && (
            <div className="space-y-4">
              {/* Main Message */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Mensagem Gerada</label>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Tom: {generated.tone}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {generated.best_send_time}
                    </Badge>
                  </div>
                </div>
                <Textarea
                  value={selectedMessage}
                  onChange={(e) => setSelectedMessage(e.target.value)}
                  className="min-h-[120px] resize-none"
                />
              </div>

              {/* Alternative Messages */}
              {generated.alternative_messages && generated.alternative_messages.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Alternativas
                  </label>
                  <div className="space-y-2">
                    {generated.alternative_messages.map((alt, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectAlternative(alt)}
                        className={cn(
                          "w-full p-3 rounded-lg border text-left text-sm transition-all",
                          selectedMessage === alt
                            ? "border-purple-500 bg-purple-50"
                            : "border-gray-200 hover:border-purple-300"
                        )}
                      >
                        {alt.length > 150 ? `${alt.substring(0, 150)}...` : alt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA Info */}
              {generated.call_to_action && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-medium text-blue-700 mb-1">Call to Action</p>
                  <p className="text-sm text-blue-600">{generated.call_to_action}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  className="flex-1"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2 text-green-500" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar
                    </>
                  )}
                </Button>
                {resolvedLeadPhone && (
                  <Button
                    onClick={handleSendWhatsApp}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Enviar no WhatsApp
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
