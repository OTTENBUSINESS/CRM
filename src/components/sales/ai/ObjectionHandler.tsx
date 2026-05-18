import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { usePlaybookContent } from "@/hooks/useSalesPlaybook";
import {
  Shield,
  RefreshCw,
  ChevronDown,
  MessageSquare,
  Copy,
  Check,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface ObjectionData {
  objection: string;
  context: string;
  counter_argument: string;
  social_proof: string;
  reconnection_question: string;
  whatsapp_script: string;
}

interface ObjectionHandlerProps {
  contactId?: string; // deprecated, use leadId
  leadId?: string;
  objections?: string[];
  className?: string;
}

export function ObjectionHandler({
  contactId,
  leadId,
  objections = [],
  className,
}: ObjectionHandlerProps) {
  // Suporta tanto leadId quanto contactId para compatibilidade
  const resolvedLeadId = leadId || contactId;
  const { toast } = useToast();
  const { data: playbookContent } = usePlaybookContent();
  const [isLoading, setIsLoading] = useState(false);
  const [handledObjections, setHandledObjections] = useState<ObjectionData[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleGenerateCounters = async () => {
    if (objections.length === 0) {
      toast({
        title: "Sem objeções",
        description: "Nenhuma objeção foi identificada para este lead",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('chat-manager', {
        body: {
          message: `Analise estas objeções e sugira formas de contorná-las:

Objeções identificadas: ${objections.join(", ")}

Para CADA objeção, forneça:
1. Contexto: Em que situação essa objeção geralmente surge
2. Contra-argumento: Argumento lógico e emocional para contornar
3. Prova social: Case de sucesso ou depoimento que ajude
4. Pergunta de reconexão: Pergunta para retomar o interesse
5. Script WhatsApp: Mensagem pronta para enviar

Responda em JSON:
{
  "objections": [
    {
      "objection": "a objeção original",
      "context": "contexto em que surge",
      "counter_argument": "argumento para contornar",
      "social_proof": "prova social ou case",
      "reconnection_question": "pergunta para retomar",
      "whatsapp_script": "mensagem pronta para WhatsApp"
    }
  ]
}`,
          agent: "cs-insights",
          context: { lead_id: resolvedLeadId },
          playbook_context: playbookContent || undefined,
        },
      });

      if (invokeError) throw invokeError;

      const replyContent = result.reply || result.content || "";
      const jsonMatch = replyContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setHandledObjections(parsed.objections || []);
      } else {
        throw new Error("Formato de resposta inválido");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao gerar contornos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyScript = (script: string, index: number) => {
    navigator.clipboard.writeText(script);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast({ title: "Script copiado!" });
  };

  if (objections.length === 0) {
    return null;
  }

  return (
    <Card className={cn("border-amber-200 bg-gradient-to-br from-amber-50/50 to-orange-50/50", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-amber-500" />
            <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
              Contorno de Objeções
            </span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateCounters}
            disabled={isLoading}
            className="border-amber-200 hover:bg-amber-50"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Lightbulb className="h-4 w-4" />
            )}
            <span className="ml-2">
              {handledObjections.length > 0 ? "Atualizar" : "Gerar Contornos"}
            </span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Original Objections */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Objeções Identificadas
          </p>
          <div className="flex flex-wrap gap-1">
            {objections.map((obj, i) => (
              <Badge
                key={i}
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200"
              >
                {obj}
              </Badge>
            ))}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {/* Handled Objections */}
        {handledObjections.length > 0 && !isLoading && (
          <div className="space-y-3">
            {handledObjections.map((handled, index) => (
              <Collapsible key={index}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-3 bg-white/60 rounded-lg border border-amber-100 hover:border-amber-300 transition-colors">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">{handled.objection}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-4 bg-white/40 rounded-b-lg border border-t-0 border-amber-100 space-y-4">
                    {/* Context */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Contexto
                      </p>
                      <p className="text-sm">{handled.context}</p>
                    </div>

                    {/* Counter Argument */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Contra-argumento
                      </p>
                      <p className="text-sm bg-green-50 p-2 rounded border border-green-200">
                        {handled.counter_argument}
                      </p>
                    </div>

                    {/* Social Proof */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Prova Social
                      </p>
                      <p className="text-sm italic text-muted-foreground">
                        "{handled.social_proof}"
                      </p>
                    </div>

                    {/* Reconnection Question */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Pergunta de Reconexão
                      </p>
                      <p className="text-sm text-blue-600">
                        {handled.reconnection_question}
                      </p>
                    </div>

                    {/* WhatsApp Script */}
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          Script WhatsApp
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleCopyScript(handled.whatsapp_script, index)}
                        >
                          {copiedIndex === index ? (
                            <>
                              <Check className="h-3 w-3 mr-1 text-green-500" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 mr-1" />
                              Copiar
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{handled.whatsapp_script}</p>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}

        {/* Empty State */}
        {handledObjections.length === 0 && !isLoading && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Clique em "Gerar Contornos" para obter estratégias de resposta
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
