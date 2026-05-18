import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Brain,
  RefreshCw,
  Target,
  MessageSquare,
  TrendingUp,
  Lightbulb,
  CheckCircle2,
  Copy,
  Phone,
  Mail,
  User,
  DollarSign,
  Clock,
  Sparkles,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LeadIntelligence {
  perfil?: {
    resumo?: string;
    persona?: string;
    momento_compra?: string;
    temperatura?: string;
  };
  insights?: {
    sentimento_geral?: string;
    nivel_interesse?: string;
    principais_dores?: string[];
    motivadores?: string[];
    bloqueios?: string[];
    objecoes_identificadas?: string[];
  };
  recomendacoes?: {
    estrategia?: string;
    proxima_acao?: string;
    melhor_horario?: string;
    canal_preferido?: string;
    tom_comunicacao?: string;
  };
  precontato?: {
    pontos_conexao?: string[];
    perguntas_chave?: string[];
    argumentos?: string[];
    objecoes_esperadas?: string[];
  };
  mensagem_sugerida?: {
    whatsapp?: string;
    email_assunto?: string;
    email_corpo?: string;
  };
  proposta?: {
    produtos_recomendados?: string[];
    valor_estimado?: string;
    desconto_sugerido?: string;
    condicoes_especiais?: string;
  };
  bant_atualizado?: {
    budget?: string;
    authority?: string;
    need?: string;
    timeline?: string;
  };
  score_sugerido?: number;
  probabilidade_fechamento?: number;
}

interface RawInsights {
  content?: string;
  updated_at?: string;
  source?: string;
}

interface LeadIntelligencePanelProps {
  leadId: string;
  leadName?: string;
  intelligence?: LeadIntelligence | null;
  rawInsights?: RawInsights | null;
  lastAnalysisAt?: string | null;
}

export function LeadIntelligencePanel({
  leadId,
  leadName,
  intelligence: initialIntelligence,
  rawInsights,
  lastAnalysisAt,
}: LeadIntelligencePanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [intelligence, setIntelligence] = useState<LeadIntelligence | null>(
    initialIntelligence || null
  );
  const [dataSources, setDataSources] = useState<string[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    toast({ title: "Gerando inteligencia...", description: "Analisando todos os dados do lead" });

    try {
      const { data, error } = await supabase.functions.invoke("generate-lead-intelligence", {
        body: { lead_id: leadId },
      });

      if (error) throw error;

      setIntelligence(data.intelligence);
      setDataSources(data.data_sources || []);

      queryClient.invalidateQueries({ queryKey: ["sales-lead", leadId] });

      toast({
        title: "Inteligencia gerada!",
        description: `${data.data_sources?.length || 0} fontes analisadas`,
      });
    } catch (error: any) {
      console.error("Erro:", error);
      toast({
        title: "Erro ao gerar",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast({ title: "Copiado!" });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getTemperaturaColor = (temp?: string) => {
    switch (temp) {
      case "quente":
        return "bg-red-100 text-red-700 border-red-200";
      case "morno":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "frio":
        return "bg-blue-100 text-blue-700 border-blue-200";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getSentimentoIcon = (sentimento?: string) => {
    switch (sentimento) {
      case "positivo":
        return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case "negativo":
        return <ThumbsDown className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  // Check if we have raw insights from chat (saved via "Salvar nos Insights")
  const hasRawContent = rawInsights?.content && rawInsights.source === 'sales-copilot';

  if (!intelligence && !isGenerating && !hasRawContent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-purple-500" />
            Inteligencia IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Sparkles className="h-12 w-12 mx-auto text-purple-300 mb-4" />
            <p className="text-muted-foreground mb-4">
              Gere insights completos sobre este lead usando IA
            </p>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              <Brain className="h-4 w-4 mr-2" />
              Gerar Inteligencia Completa
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Display raw content from Sales Copilot chat
  if (!intelligence && !isGenerating && hasRawContent) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5 text-purple-500" />
              Inteligencia IA
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Gerar Completa
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">
              <Sparkles className="h-3 w-3 mr-1" />
              Salvo do Sales Copilot
            </Badge>
            {rawInsights?.updated_at && (
              <span className="text-xs text-muted-foreground">
                {new Date(rawInsights.updated_at).toLocaleString('pt-BR')}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="text-sm space-y-4 [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:my-4 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:my-4 [&_ol]:ml-4 [&_ol]:list-decimal [&_li]:my-2 [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-medium [&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:font-medium [&_hr]:my-5 [&_table]:my-4 [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_td]:p-2 [&_td]:border-b [&_blockquote]:my-4 [&_blockquote]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_strong]:font-semibold [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {rawInsights!.content!}
              </ReactMarkdown>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-right">
            {rawInsights!.content!.length} caracteres
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isGenerating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-purple-500 animate-pulse" />
            Gerando Inteligencia...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-purple-500" />
            Inteligencia IA
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
            <RefreshCw className={cn("h-4 w-4 mr-1", isGenerating && "animate-spin")} />
            Atualizar
          </Button>
        </div>
        {dataSources.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Fontes: {dataSources.join(" | ")}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="perfil" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="perfil" className="text-xs">
              <User className="h-3 w-3 mr-1" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="estrategia" className="text-xs">
              <Target className="h-3 w-3 mr-1" />
              Estrategia
            </TabsTrigger>
            <TabsTrigger value="mensagens" className="text-xs">
              <MessageSquare className="h-3 w-3 mr-1" />
              Mensagens
            </TabsTrigger>
            <TabsTrigger value="proposta" className="text-xs">
              <DollarSign className="h-3 w-3 mr-1" />
              Proposta
            </TabsTrigger>
          </TabsList>

          {/* PERFIL */}
          <TabsContent value="perfil" className="space-y-4">
            {/* Header com temperatura e score */}
            <div className="flex items-center gap-2 flex-wrap">
              {intelligence?.perfil?.temperatura && (
                <Badge className={getTemperaturaColor(intelligence.perfil.temperatura)}>
                  {intelligence.perfil.temperatura.toUpperCase()}
                </Badge>
              )}
              {intelligence?.score_sugerido && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  Score: {intelligence.score_sugerido}
                </Badge>
              )}
              {intelligence?.probabilidade_fechamento && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  {intelligence.probabilidade_fechamento}% fechamento
                </Badge>
              )}
              {intelligence?.insights?.sentimento_geral && (
                <span className="flex items-center gap-1 text-sm">
                  {getSentimentoIcon(intelligence.insights.sentimento_geral)}
                  {intelligence.insights.sentimento_geral}
                </span>
              )}
            </div>

            {/* Resumo */}
            {intelligence?.perfil?.resumo && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm">{intelligence.perfil.resumo}</p>
                {intelligence.perfil.persona && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Persona: {intelligence.perfil.persona}
                  </p>
                )}
              </div>
            )}

            {/* Dores e Motivadores */}
            <div className="grid grid-cols-2 gap-3">
              {intelligence?.insights?.principais_dores?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-1">Dores</p>
                  <ul className="text-xs space-y-1">
                    {intelligence.insights.principais_dores.map((d, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 text-red-400 mt-0.5 flex-shrink-0" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {intelligence?.insights?.motivadores?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-600 mb-1">Motivadores</p>
                  <ul className="text-xs space-y-1">
                    {intelligence.insights.motivadores.map((m, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <Lightbulb className="h-3 w-3 text-green-400 mt-0.5 flex-shrink-0" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* BANT */}
            {intelligence?.bant_atualizado && (
              <div className="grid grid-cols-2 gap-2 p-3 bg-blue-50/50 rounded-lg">
                <div className="text-xs">
                  <span className="font-medium text-blue-700">Budget:</span>{" "}
                  {intelligence.bant_atualizado.budget || "N/A"}
                </div>
                <div className="text-xs">
                  <span className="font-medium text-blue-700">Authority:</span>{" "}
                  {intelligence.bant_atualizado.authority || "N/A"}
                </div>
                <div className="text-xs">
                  <span className="font-medium text-blue-700">Need:</span>{" "}
                  {intelligence.bant_atualizado.need || "N/A"}
                </div>
                <div className="text-xs">
                  <span className="font-medium text-blue-700">Timeline:</span>{" "}
                  {intelligence.bant_atualizado.timeline || "N/A"}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ESTRATEGIA */}
          <TabsContent value="estrategia" className="space-y-4">
            {intelligence?.recomendacoes?.estrategia && (
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-xs font-medium text-purple-700 mb-1">Estrategia</p>
                <p className="text-sm">{intelligence.recomendacoes.estrategia}</p>
              </div>
            )}

            {intelligence?.recomendacoes?.proxima_acao && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  Proxima Acao
                </p>
                <p className="text-sm font-medium">{intelligence.recomendacoes.proxima_acao}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs">
              {intelligence?.recomendacoes?.melhor_horario && (
                <div className="p-2 bg-muted/50 rounded text-center">
                  <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  {intelligence.recomendacoes.melhor_horario}
                </div>
              )}
              {intelligence?.recomendacoes?.canal_preferido && (
                <div className="p-2 bg-muted/50 rounded text-center">
                  <MessageSquare className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  {intelligence.recomendacoes.canal_preferido}
                </div>
              )}
              {intelligence?.recomendacoes?.tom_comunicacao && (
                <div className="p-2 bg-muted/50 rounded text-center">
                  <User className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  {intelligence.recomendacoes.tom_comunicacao}
                </div>
              )}
            </div>

            {/* Precontato */}
            {intelligence?.precontato?.perguntas_chave?.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">Perguntas Chave</p>
                <ul className="text-xs space-y-1">
                  {intelligence.precontato.perguntas_chave.map((p, i) => (
                    <li key={i} className="p-2 bg-muted/30 rounded">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {intelligence?.precontato?.objecoes_esperadas?.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">Objecoes Esperadas</p>
                <ul className="text-xs space-y-1">
                  {intelligence.precontato.objecoes_esperadas.map((o, i) => (
                    <li key={i} className="p-2 bg-orange-50 rounded text-orange-800">
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* MENSAGENS */}
          <TabsContent value="mensagens" className="space-y-4">
            {intelligence?.mensagem_sugerida?.whatsapp && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-green-700 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    WhatsApp
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() =>
                      copyToClipboard(intelligence.mensagem_sugerida!.whatsapp!, "whatsapp")
                    }
                  >
                    {copiedField === "whatsapp" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {intelligence.mensagem_sugerida.whatsapp}
                </p>
              </div>
            )}

            {intelligence?.mensagem_sugerida?.email_assunto && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-blue-700 flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    Email
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() =>
                      copyToClipboard(
                        `Assunto: ${intelligence.mensagem_sugerida!.email_assunto}\n\n${intelligence.mensagem_sugerida!.email_corpo}`,
                        "email"
                      )
                    }
                  >
                    {copiedField === "email" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <p className="text-xs font-medium mb-1">
                  Assunto: {intelligence.mensagem_sugerida.email_assunto}
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {intelligence.mensagem_sugerida.email_corpo}
                </p>
              </div>
            )}
          </TabsContent>

          {/* PROPOSTA */}
          <TabsContent value="proposta" className="space-y-4">
            {intelligence?.proposta?.produtos_recomendados?.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">Produtos Recomendados</p>
                <div className="flex flex-wrap gap-2">
                  {intelligence.proposta.produtos_recomendados.map((p, i) => (
                    <Badge key={i} variant="secondary">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {intelligence?.proposta?.valor_estimado && (
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Ticket Estimado</p>
                  <p className="text-lg font-bold text-green-700">
                    {intelligence.proposta.valor_estimado}
                  </p>
                </div>
              )}
              {intelligence?.proposta?.desconto_sugerido && (
                <div className="p-3 bg-orange-50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Desconto Sugerido</p>
                  <p className="text-lg font-bold text-orange-700">
                    {intelligence.proposta.desconto_sugerido}
                  </p>
                </div>
              )}
            </div>

            {intelligence?.proposta?.condicoes_especiais && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs font-medium mb-1">Condicoes Especiais</p>
                <p className="text-sm">{intelligence.proposta.condicoes_especiais}</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
