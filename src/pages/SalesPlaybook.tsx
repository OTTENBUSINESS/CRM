import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useSalesPlaybook, useUpdatePlaybook } from "@/hooks/useSalesPlaybook";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen,
  Save,
  Eye,
  Edit3,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  FileText,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['strong', 'em', 'blockquote', 'li', 'br', 'h1', 'h2', 'h3', 'p', 'ul', 'ol', 'a', 'code', 'pre'], ALLOWED_ATTR: ['class', 'href', 'target'] })
    .replace(/<iframe\b[^>]*>/gi, '')
    .replace(/<object\b[^>]*>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '');
}

// Simple Markdown renderer (basic)
function MarkdownPreview({ content }: { content: string }) {
  // Very basic markdown to HTML conversion
  const html = content
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-8 mb-3 pb-2 border-b">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-8 mb-4 pb-2 border-b-2">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Blockquotes
    .replace(/^> (.*$)/gim, '<blockquote class="border-l-4 border-primary/30 pl-4 py-1 my-2 text-muted-foreground italic">$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gim, '<hr class="my-6 border-t-2">')
    // Lists
    .replace(/^\- (.*$)/gim, '<li class="ml-4">• $1</li>')
    .replace(/^\d+\. (.*$)/gim, '<li class="ml-4">$1</li>')
    // Line breaks
    .replace(/\n/g, '<br>');

  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}

const SalesPlaybook = () => {
  const { toast } = useToast();
  const { data: playbook, isLoading, refetch } = useSalesPlaybook();
  const updatePlaybook = useUpdatePlaybook();

  const [content, setContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Initialize content when playbook loads
  useEffect(() => {
    if (playbook?.content) {
      setContent(playbook.content);
      setLastSaved(new Date(playbook.updated_at));
    }
  }, [playbook]);

  // Track changes
  useEffect(() => {
    if (playbook?.content) {
      setHasChanges(content !== playbook.content);
    }
  }, [content, playbook?.content]);

  const handleSave = async () => {
    if (!playbook?.id) return;

    try {
      await updatePlaybook.mutateAsync({
        id: playbook.id,
        content,
      });

      setHasChanges(false);
      setLastSaved(new Date());
      toast({
        title: "Playbook salvo!",
        description: "As alterações foram salvas com sucesso.",
      });
    } catch (error) {
      console.error("Error saving playbook:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o playbook. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (hasChanges && playbook?.id) {
          handleSave();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasChanges, playbook?.id, content]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <BookOpen className="h-7 w-7 text-primary" />
              Playbook de Vendas
            </h1>
            <p className="text-muted-foreground">
              Configure o contexto e diretrizes para a IA de vendas
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastSaved && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Salvo: {lastSaved.toLocaleTimeString("pt-BR")}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updatePlaybook.isPending}
              className={cn(hasChanges && "bg-green-600 hover:bg-green-700")}
            >
              {updatePlaybook.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar
              {hasChanges && <Badge variant="secondary" className="ml-2">*</Badge>}
            </Button>
          </div>
        </div>

        {/* Info Alert */}
        <Alert className="bg-blue-50 border-blue-200">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            O conteúdo deste playbook será usado como contexto em todas as interações de IA do módulo comercial
            (geração de mensagens, sugestões de proposta, tratamento de objeções, etc).
          </AlertDescription>
        </Alert>

        {/* Editor Card */}
        <Card className="min-h-[600px]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {playbook?.title || "Playbook"}
                  {playbook?.version && (
                    <Badge variant="outline" className="text-xs">
                      v{playbook.version}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Use Markdown para formatar o conteúdo
                </CardDescription>
              </div>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "edit" | "preview")}>
                <TabsList>
                  <TabsTrigger value="edit" className="gap-2">
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="gap-2">
                    <Eye className="h-4 w-4" />
                    Visualizar
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === "edit" ? (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escreva o playbook usando Markdown..."
                className="min-h-[500px] font-mono text-sm resize-none"
              />
            ) : (
              <div className="min-h-[500px] p-4 bg-muted/30 rounded-lg overflow-auto">
                <MarkdownPreview content={content} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Help Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dicas de Formatação Markdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="font-mono text-muted-foreground"># Título</p>
                <p className="text-xs text-muted-foreground">Título principal</p>
              </div>
              <div>
                <p className="font-mono text-muted-foreground">## Subtítulo</p>
                <p className="text-xs text-muted-foreground">Seção</p>
              </div>
              <div>
                <p className="font-mono text-muted-foreground">**negrito**</p>
                <p className="text-xs text-muted-foreground">Texto em negrito</p>
              </div>
              <div>
                <p className="font-mono text-muted-foreground">*itálico*</p>
                <p className="text-xs text-muted-foreground">Texto em itálico</p>
              </div>
              <div>
                <p className="font-mono text-muted-foreground">- item</p>
                <p className="text-xs text-muted-foreground">Lista</p>
              </div>
              <div>
                <p className="font-mono text-muted-foreground">&gt; citação</p>
                <p className="text-xs text-muted-foreground">Bloco de citação</p>
              </div>
              <div>
                <p className="font-mono text-muted-foreground">---</p>
                <p className="text-xs text-muted-foreground">Linha horizontal</p>
              </div>
              <div>
                <p className="font-mono text-muted-foreground">Ctrl+S</p>
                <p className="text-xs text-muted-foreground">Salvar</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default SalesPlaybook;
