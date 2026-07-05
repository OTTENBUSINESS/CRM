import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MessageSquare, Plus, RefreshCw, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  useWhatsAppTemplates,
  useSyncCloudTemplates,
  useDeleteCloudTemplate,
  type WhatsAppCloudTemplate,
} from '@/hooks/useWhatsAppTemplates';
import { cn } from '@/lib/utils';
import { AppLayout } from '@/components/layout/AppLayout';

// Cor do badge por status de aprovação Meta
const statusStyles: Record<string, string> = {
  PENDING: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  APPROVED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  REJECTED: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
};

// Extrai o texto do componente BODY do jsonb de components
function getBodyPreview(template: WhatsAppCloudTemplate): string {
  const body = (template.components || []).find(
    (c: any) => c?.type === 'BODY'
  );
  return body?.text || '';
}

export default function WhatsAppTemplates() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: templates, isLoading } = useWhatsAppTemplates();
  const sync = useSyncCloudTemplates();
  const del = useDeleteCloudTemplate();
  const [toDelete, setToDelete] = useState<WhatsAppCloudTemplate | null>(null);

  const handleSync = async () => {
    try {
      await sync.mutateAsync();
      toast({ title: 'Templates sincronizados com a Meta' });
    } catch (err: any) {
      toast({
        title: 'Erro ao sincronizar',
        description: err?.message || 'Falha de rede',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast({ title: 'Template removido' });
    } catch (err: any) {
      toast({
        title: 'Erro ao remover',
        description: err?.message || 'Falha de rede',
        variant: 'destructive',
      });
    } finally {
      setToDelete(null);
    }
  };

  return (
    <AppLayout>
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Templates de WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              Modelos de mensagem aprovados pela Meta Cloud API
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSync} disabled={sync.isPending}>
            {sync.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sincronizar
          </Button>
          <Button onClick={() => navigate('/marketing/whatsapp-templates/novo')}>
            <Plus className="h-4 w-4 mr-2" />
            Novo
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const preview = getBodyPreview(t);
            return (
              <Card key={t.id} className="border border-border/60">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-semibold leading-snug break-all">
                      {t.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[11px] font-medium shrink-0',
                        statusStyles[t.status] ?? 'bg-muted text-muted-foreground'
                      )}
                    >
                      {statusLabels[t.status] ?? t.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                    {t.category && (
                      <span className="uppercase tracking-wide">{t.category}</span>
                    )}
                    <span>·</span>
                    <span>{t.language}</span>
                  </div>
                </CardHeader>

                <CardContent className="px-4 pb-4 space-y-3">
                  {preview ? (
                    <p className="text-[12px] text-muted-foreground line-clamp-4 leading-relaxed whitespace-pre-wrap">
                      {preview}
                    </p>
                  ) : (
                    <p className="text-[12px] text-muted-foreground/50 italic">
                      Sem corpo de mensagem
                    </p>
                  )}

                  {t.rejection_reason && (
                    <p className="text-[11px] text-red-500">
                      Motivo: {t.rejection_reason}
                    </p>
                  )}

                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={() => setToDelete(t)}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <h3 className="mt-4 text-lg font-medium">Nenhum template</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Crie um novo template ou sincronize os existentes com a Meta.
          </p>
        </div>
      )}

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro local de <strong>{toDelete?.name}</strong> será removido. Isso não
              apaga o template na Meta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </AppLayout>
  );
}
