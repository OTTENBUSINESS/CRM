import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePlaybookContent } from "@/hooks/useSalesPlaybook";
import {
  Clipboard,
  RefreshCw,
  User,
  Globe,
  MessageSquare,
  AlertTriangle,
  Target,
  Lightbulb,
  Phone,
  Copy,
  Check,
  Clock,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface BriefingData {
  who: string;
  how_found_us: string;
  timeline_summary: string[];
  last_conversation: string;
  known_objections: string[];
  interests: string[];
  sentiment: string;
  attention_points: string[];
  opening_hook: string;
  call_objective: string;
}

interface PreContactBriefingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string; // deprecated, use leadId
  leadId?: string;
  contactName?: string; // deprecated, use leadName
  leadName?: string;
  contactPhone?: string; // deprecated, use leadPhone
  leadPhone?: string;
}

export function PreContactBriefing({
  open,
  onOpenChange,
  contactId,
  leadId,
  contactName,
  leadName,
  contactPhone,
  leadPhone,
}: PreContactBriefingProps) {
  // Suporta tanto leadId quanto contactId para compatibilidade
  const resolvedLeadId = leadId || contactId;
  const resolvedLeadName = leadName || contactName || 'este lead';
  const resolvedLeadPhone = leadPhone || contactPhone;
  const { toast } = useToast();
  const { data: playbookContent } = usePlaybookContent();
  const [isLoading, setIsLoading] = useState(false);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateBriefing = async () => {
    setIsLoading(true);
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('generate-briefing', {
        body: {
          lead_id: resolvedLeadId,
          playbook_context: playbookContent || undefined,
        },
      });

      if (invokeError) throw invokeError;

      if (result.briefing) {
        setBriefing(result.briefing);
      } else {
        throw new Error("Briefing não retornado");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao gerar briefing",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyBriefing = () => {
    if (!briefing) return;

    const text = `
📋 BRIEFING PRÉ-CONTATO: ${resolvedLeadName}

👤 Quem é: ${briefing.who}
🌐 Origem: ${briefing.how_found_us}

📅 Timeline:
${briefing.timeline_summary.map((e) => `• ${e}`).join("\n")}

💬 Última conversa: ${briefing.last_conversation}

⚠️ Objeções conhecidas:
${briefing.known_objections.map((o) => `• ${o}`).join("\n")}

✨ Interesses:
${briefing.interests.map((i) => `• ${i}`).join("\n")}

😊 Sentimento: ${briefing.sentiment}

🚨 Atenção:
${briefing.attention_points.map((p) => `• ${p}`).join("\n")}

💡 Gancho de abertura: ${briefing.opening_hook}

🎯 Objetivo: ${briefing.call_objective}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Briefing copiado!" });
  };

  const handleCall = () => {
    if (resolvedLeadPhone) {
      window.open(`tel:${resolvedLeadPhone}`);
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case "positivo":
        return "bg-green-100 text-green-700 border-green-200";
      case "negativo":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clipboard className="h-5 w-5 text-cyan-500" />
            Briefing Pré-Contato
          </SheetTitle>
          <SheetDescription>
            Preparação para contato com {resolvedLeadName}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {!briefing && !isLoading && (
            <div className="text-center py-12">
              <Clipboard className="h-12 w-12 mx-auto text-cyan-300 mb-4" />
              <p className="text-muted-foreground mb-4">
                Gere um briefing completo antes de ligar para o lead
              </p>
              <Button onClick={handleGenerateBriefing}>
                <Clipboard className="h-4 w-4 mr-2" />
                Gerar Briefing
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}

          {briefing && !isLoading && (
            <ScrollArea className="h-[calc(100vh-200px)] pr-4">
              <div className="space-y-6">
                {/* Who & Origin */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <User className="h-5 w-5 text-cyan-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Quem é</p>
                      <p className="text-sm text-muted-foreground">{briefing.who}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-cyan-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Origem</p>
                      <p className="text-sm text-muted-foreground">{briefing.how_found_us}</p>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                {briefing.timeline_summary.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-cyan-500" />
                      Timeline
                    </p>
                    <div className="space-y-2 pl-6 border-l-2 border-cyan-200">
                      {briefing.timeline_summary.map((event, i) => (
                        <p key={i} className="text-sm text-muted-foreground relative">
                          <span className="absolute -left-[17px] w-2 h-2 bg-cyan-400 rounded-full top-1.5" />
                          {event}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Last Conversation */}
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-cyan-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Última Conversa</p>
                    <p className="text-sm text-muted-foreground">{briefing.last_conversation}</p>
                  </div>
                </div>

                {/* Sentiment */}
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-cyan-500" />
                  <span className="text-sm font-medium">Sentimento:</span>
                  <Badge variant="outline" className={getSentimentColor(briefing.sentiment)}>
                    {briefing.sentiment}
                  </Badge>
                </div>

                {/* Objections */}
                {briefing.known_objections.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Objeções Conhecidas
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {briefing.known_objections.map((obj, i) => (
                        <Badge key={i} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          {obj}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interests */}
                {briefing.interests.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4 text-green-500" />
                      Interesses
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {briefing.interests.map((int, i) => (
                        <Badge key={i} variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          {int}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attention Points */}
                {briefing.attention_points.length > 0 && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm font-medium text-red-700 mb-2">⚠️ Pontos de Atenção</p>
                    <ul className="space-y-1">
                      {briefing.attention_points.map((point, i) => (
                        <li key={i} className="text-sm text-red-600">• {point}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Opening Hook */}
                <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-200">
                  <p className="text-sm font-medium text-cyan-700 mb-1 flex items-center gap-1">
                    <Lightbulb className="h-4 w-4" />
                    Gancho de Abertura
                  </p>
                  <p className="text-sm text-cyan-600">{briefing.opening_hook}</p>
                </div>

                {/* Objective */}
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-sm font-medium text-purple-700 mb-1 flex items-center gap-1">
                    <Target className="h-4 w-4" />
                    Objetivo da Ligação
                  </p>
                  <p className="text-sm text-purple-600">{briefing.call_objective}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={handleCopyBriefing} className="flex-1">
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
                    <Button onClick={handleCall} className="flex-1 bg-green-600 hover:bg-green-700">
                      <Phone className="h-4 w-4 mr-2" />
                      Ligar
                    </Button>
                  )}
                </div>

                {/* Refresh */}
                <Button
                  variant="ghost"
                  onClick={handleGenerateBriefing}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar Briefing
                </Button>
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
