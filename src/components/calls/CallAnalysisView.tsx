import {
  FileText,
  Sparkles,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Loader2,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Target,
  User,
  Star,
  TrendingUp,
  Lightbulb,
  Handshake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { SalesCallAnalysis } from "@/hooks/useAnalyzeSalesCall";

interface CallAnalysisViewProps {
  analysis: SalesCallAnalysis;
  onDeepAnalyze?: () => void;
  isAnalyzing?: boolean;
  showDeepButton?: boolean;
}

const sentimentConfigs = {
  positive: {
    icon: ThumbsUp,
    label: "Positivo",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    color: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  negative: {
    icon: ThumbsDown,
    label: "Negativo",
    bg: "bg-red-50 dark:bg-red-950/40",
    color: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
  },
  neutral: {
    icon: Minus,
    label: "Neutro",
    bg: "bg-slate-50 dark:bg-slate-800/40",
    color: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700",
  },
};

export function CallAnalysisView({
  analysis,
  onDeepAnalyze,
  isAnalyzing = false,
  showDeepButton = false,
}: CallAnalysisViewProps) {
  const sentimentKey = analysis.sentimento as keyof typeof sentimentConfigs;
  const sentimentConfig = sentimentConfigs[sentimentKey] ?? sentimentConfigs.neutral;
  const SentimentIcon = sentimentConfig.icon;
  const isDeep = analysis.analysis_depth === 'deep';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-violet-100 dark:bg-violet-900/50 rounded-lg">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </div>
        <span className="font-semibold text-foreground">Análise da Chamada</span>
        <Badge variant="outline" className={cn("ml-1", sentimentConfig.bg, sentimentConfig.color, sentimentConfig.border)}>
          <SentimentIcon className="h-3.5 w-3.5 mr-1" />
          {sentimentConfig.label}
        </Badge>
        {isDeep && (
          <Badge className="bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700 ml-1">
            <Sparkles className="h-3 w-3 mr-1" />
            Aprofundada
          </Badge>
        )}
      </div>

      {/* Perfil do Lead (deep only) */}
      {analysis.perfil_lead && (
        <div className="p-4 bg-gradient-to-br from-purple-50 to-fuchsia-50 dark:from-purple-950/40 dark:to-fuchsia-950/40 rounded-xl border border-purple-200 dark:border-purple-800">
          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 mb-1">Perfil do Lead</p>
              <p className="text-sm text-purple-700 dark:text-purple-300 leading-relaxed">{analysis.perfil_lead}</p>
            </div>
          </div>
        </div>
      )}

      {/* Diagnóstico */}
      {analysis.diagnostico && (
        <div className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40 rounded-xl border border-violet-200 dark:border-violet-800">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-violet-600 dark:text-violet-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-violet-800 dark:text-violet-200 mb-1">Diagnóstico</p>
              <p className="text-sm text-violet-700 dark:text-violet-300 leading-relaxed">{analysis.diagnostico}</p>
            </div>
          </div>
        </div>
      )}

      {/* Negociação (deep only) */}
      {analysis.negociacao?.desfecho && (
        <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-start gap-3">
            <Handshake className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 mb-1">Negociação</p>
              <p className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">{analysis.negociacao.desfecho}</p>
              {analysis.negociacao.detalhes && (
                <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-1 leading-relaxed">{analysis.negociacao.detalhes}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grid: Pontos-chave e Riscos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.isArray(analysis.pontos_chave) && analysis.pontos_chave.length > 0 && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Pontos-Chave
            </p>
            <ul className="space-y-1.5">
              {analysis.pontos_chave.map((point, index) => (
                <li key={index} className="text-sm text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                  <span className="text-emerald-400 dark:text-emerald-500 mt-1.5 text-xs">●</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(analysis.riscos) && analysis.riscos.length > 0 && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Riscos / Objeções
            </p>
            <ul className="space-y-1.5">
              {analysis.riscos.map((risk, index) => (
                <li key={index} className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <span className="text-amber-400 dark:text-amber-500 mt-1.5 text-xs">●</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Pontos Fortes do Vendedor (deep only) */}
      {Array.isArray(analysis.pontos_fortes_vendedor) && analysis.pontos_fortes_vendedor.length > 0 && (
        <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-green-800 dark:text-green-200">
            <Star className="h-4 w-4 text-green-600 dark:text-green-400" />
            Pontos Fortes do Vendedor
          </p>
          <ul className="space-y-1.5">
            {analysis.pontos_fortes_vendedor.map((point, index) => (
              <li key={index} className="text-sm text-green-700 dark:text-green-300 flex items-start gap-2">
                <span className="text-green-500 dark:text-green-400 mt-0.5">★</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Veredicto (deep only) */}
      {analysis.veredicto && (
        <div className="p-4 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-white mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <p className="text-sm font-semibold text-white">Veredicto</p>
                <Badge className={cn(
                  "text-sm font-bold px-2.5",
                  analysis.veredicto.probabilidade >= 70
                    ? "bg-emerald-500 text-white"
                    : analysis.veredicto.probabilidade >= 40
                    ? "bg-amber-500 text-white"
                    : "bg-red-500 text-white"
                )}>
                  {analysis.veredicto.probabilidade}%
                </Badge>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{analysis.veredicto.justificativa}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recomendação Estratégica (deep only) */}
      {analysis.recomendacao_estrategica && (
        <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40 rounded-xl border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">Recomendação Estratégica</p>
              <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">{analysis.recomendacao_estrategica}</p>
            </div>
          </div>
        </div>
      )}

      {/* Próximo Passo */}
      {analysis.proximo_passo && (
        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <ArrowRight className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">Próximo Passo Recomendado</p>
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">{analysis.proximo_passo}</p>
            </div>
          </div>
        </div>
      )}

      {/* Dados Extraídos (BANT) */}
      {analysis.dados_extraidos && Object.values(analysis.dados_extraidos).some(v => v) && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-muted/30 rounded-xl border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-muted/50 transition-colors">
              <span className="text-sm font-medium flex items-center gap-2 text-slate-700 dark:text-foreground">
                <Target className="h-4 w-4 text-slate-500 dark:text-muted-foreground" />
                Dados Extraídos (BANT)
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="p-3 bg-slate-50 dark:bg-muted/30 rounded-xl border border-slate-200 dark:border-border">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {analysis.dados_extraidos.empresa && (
                  <div><span className="text-muted-foreground">Empresa:</span> <span className="font-medium">{analysis.dados_extraidos.empresa}</span></div>
                )}
                {analysis.dados_extraidos.cargo && (
                  <div><span className="text-muted-foreground">Cargo:</span> <span className="font-medium">{analysis.dados_extraidos.cargo}</span></div>
                )}
                {analysis.dados_extraidos.necessidade && (
                  <div className="col-span-2"><span className="text-muted-foreground">Necessidade:</span> <span className="font-medium">{analysis.dados_extraidos.necessidade}</span></div>
                )}
                {analysis.dados_extraidos.orcamento && (
                  <div><span className="text-muted-foreground">Orçamento:</span> <span className="font-medium">{analysis.dados_extraidos.orcamento}</span></div>
                )}
                {analysis.dados_extraidos.timeline && (
                  <div><span className="text-muted-foreground">Timeline:</span> <span className="font-medium">{analysis.dados_extraidos.timeline}</span></div>
                )}
                {analysis.dados_extraidos.decisor && (
                  <div><span className="text-muted-foreground">Decisor:</span> <span className="font-medium">{analysis.dados_extraidos.decisor}</span></div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Botão Aprofundar Análise */}
      {!isDeep && showDeepButton && onDeepAnalyze && (
        <Button
          onClick={onDeepAnalyze}
          disabled={isAnalyzing}
          variant="outline"
          className="w-full border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50 text-violet-700 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-200"
        >
          {isAnalyzing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {isAnalyzing ? "Aprofundando análise..." : "Aprofundar Análise (IA Pro)"}
        </Button>
      )}
    </div>
  );
}
