import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePlaybookContent } from "@/hooks/useSalesPlaybook";
import { useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Target,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface ConversationInsights {
  sentiment: "positive" | "neutral" | "negative";
  interest_level: "high" | "medium" | "low";
  objections: string[];
  interests: string[];
  questions_unanswered: string[];
  products_mentioned: string[];
  urgency_detected: boolean;
  key_insights: string[];
  recommended_action: string;
  summary: string;
  data_sources_used?: string[];
}

interface LeadInsightsCardProps {
  contactId?: string; // deprecated, use leadId
  leadId?: string;
  insights?: ConversationInsights | null;
  lastAnalysisAt?: string | null;
  className?: string;
}

export function LeadInsightsCard({
  contactId,
  leadId,
  insights,
  lastAnalysisAt,
  className,
}: LeadInsightsCardProps) {
  // Suporta tanto leadId quanto contactId para compatibilidade
  const resolvedLeadId = leadId || contactId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: playbookContent } = usePlaybookContent();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [localInsights, setLocalInsights] = useState<ConversationInsights | null>(
    insights || null
  );
  const [dataSources, setDataSources] = useState<string[]>([]);

  const handleAnalyze = async () => {
    if (!resolvedLeadId) return;

    setIsAnalyzing(true);
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('analyze-conversation', {
        body: {
          lead_id: resolvedLeadId,
          playbook_context: playbookContent || undefined,
        },
      });

      if (invokeError) throw invokeError;

      setLocalInsights(result.analysis);
      setDataSources(result.data_sources || []);

      // Invalidar queries para atualizar dados persistidos
      queryClient.invalidateQueries({ queryKey: ["sales-lead", resolvedLeadId] });
      queryClient.invalidateQueries({ queryKey: ["contact-detail", resolvedLeadId] });

      const sourcesCount = result.data_sources?.length || 0;
      toast({
        title: "Análise concluída!",
        description: `${sourcesCount} fontes de dados analisadas`,
      });
    } catch (error: any) {
      toast({
        title: "Erro na análise",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const displayInsights = localInsights || insights;

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case "positive":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "negative":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Target className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "positive":
        return "bg-green-100 text-green-700 border-green-200";
      case "negative":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getInterestColor = (level: string) => {
    switch (level) {
      case "high":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <Card className={cn("border-purple-200 bg-gradient-to-br from-purple-50/50 to-indigo-50/50", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-purple-500" />
            <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Insights da IA
            </span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="border-purple-200 hover:bg-purple-50"
          >
            {isAnalyzing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">{displayInsights ? "Atualizar" : "Analisar"}</span>
          </Button>
        </div>
        {lastAnalysisAt && (
          <p className="text-xs text-muted-foreground">
            Última análise: {new Date(lastAnalysisAt).toLocaleString("pt-BR")}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isAnalyzing ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : displayInsights ? (
          <>
            {/* Sentiment & Interest Level */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={getSentimentColor(displayInsights.sentiment)}>
                {getSentimentIcon(displayInsights.sentiment)}
                <span className="ml-1">
                  {displayInsights.sentiment === "positive"
                    ? "Positivo"
                    : displayInsights.sentiment === "negative"
                    ? "Negativo"
                    : "Neutro"}
                </span>
              </Badge>
              <Badge variant="outline" className={getInterestColor(displayInsights.interest_level)}>
                <Target className="h-3 w-3 mr-1" />
                Interesse{" "}
                {displayInsights.interest_level === "high"
                  ? "Alto"
                  : displayInsights.interest_level === "medium"
                  ? "Médio"
                  : "Baixo"}
              </Badge>
              {displayInsights.urgency_detected && (
                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Urgência detectada
                </Badge>
              )}
            </div>

            {/* Summary */}
            {displayInsights.summary && (
              <div className="p-3 bg-white/60 rounded-lg border border-purple-100">
                <p className="text-sm text-muted-foreground">{displayInsights.summary}</p>
              </div>
            )}

            {/* Key Insights */}
            {displayInsights.key_insights && displayInsights.key_insights.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" />
                  Insights Chave
                </p>
                <ul className="space-y-1">
                  {displayInsights.key_insights.slice(0, 4).map((insight, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Interests */}
            {displayInsights.interests && displayInsights.interests.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Interesses demonstrados
                </p>
                <div className="flex flex-wrap gap-1">
                  {displayInsights.interests.map((interest, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="bg-green-50 text-green-700 border-green-200 text-xs"
                    >
                      {interest}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Objections */}
            {displayInsights.objections && displayInsights.objections.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Objeções identificadas
                </p>
                <div className="flex flex-wrap gap-1">
                  {displayInsights.objections.map((objection, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="bg-red-50 text-red-700 border-red-200 text-xs"
                    >
                      {objection}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Action */}
            {displayInsights.recommended_action && (
              <div className="p-3 bg-purple-100/50 rounded-lg border border-purple-200">
                <p className="text-xs font-medium text-purple-700 mb-1">Ação Recomendada</p>
                <p className="text-sm">{displayInsights.recommended_action}</p>
              </div>
            )}

            {/* Data Sources */}
            {(displayInsights.data_sources_used || dataSources.length > 0) && (
              <div className="pt-2 border-t border-purple-100">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  Fontes de dados analisadas
                </p>
                <div className="flex flex-wrap gap-1">
                  {(displayInsights.data_sources_used || dataSources).map((source, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="bg-slate-50 text-slate-600 border-slate-200 text-xs"
                    >
                      {source === "lead" && "Lead"}
                      {source === "whatsapp_messages" && "WhatsApp"}
                      {source === "activities" && "Atividades"}
                      {source === "transactions" && "Transações"}
                      {source === "deals" && "Deals"}
                      {source === "checkouts" && "Checkouts"}
                      {source === "instagram_profile" && "Instagram"}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-6">
            <Brain className="h-10 w-10 mx-auto text-purple-300 mb-2" />
            <p className="text-sm text-muted-foreground">
              Clique em "Analisar" para obter insights da IA sobre as conversas deste lead
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
