import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit, Trash2, Copy, Eye } from 'lucide-react';
import { useEmailTemplates, useDeleteEmailTemplate, useCreateEmailTemplate } from '@/hooks/useEmailMarketing';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { EmailTemplate } from '@/types/email.types';
import EmailPreviewModal from './EmailPreviewModal';

interface Props {
  onEditTemplate: (id: string) => void;
  onNewTemplate: () => void;
  selectable?: boolean;
  onSelect?: (template: EmailTemplate) => void;
}

export default function EmailTemplateGallery({ onEditTemplate, onNewTemplate, selectable, onSelect }: Props) {
  const { data: templates, isLoading } = useEmailTemplates();
  const deleteTemplate = useDeleteEmailTemplate();
  const duplicateTemplate = useCreateEmailTemplate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  const filtered = (templates || []).filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subject.toLowerCase().includes(search.toLowerCase())
  );

  const handleDuplicate = async (template: EmailTemplate) => {
    try {
      await duplicateTemplate.mutateAsync({
        name: `${template.name} (cópia)`,
        subject: template.subject,
        html_content: template.html_content,
        text_content: template.text_content,
        design_json: template.design_json,
        category: template.category,
        variables: template.variables,
      });
      toast({ title: 'Template duplicado' });
    } catch {
      toast({ title: 'Erro ao duplicar', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast({ title: 'Template removido' });
    } catch {
      toast({ title: 'Erro ao remover', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar templates..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Nenhum template encontrado</p>
            <Button variant="outline" className="mt-4" onClick={onNewTemplate}>
              <Plus className="h-4 w-4 mr-1" /> Criar primeiro template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(template => (
            <Card
              key={template.id}
              className={selectable ? 'cursor-pointer hover:ring-2 hover:ring-primary transition-all' : ''}
              onClick={selectable ? () => onSelect?.(template) : undefined}
            >
              <CardContent className="p-4 space-y-3">
                {/* Thumbnail preview — iframe sandboxed escalado pra mostrar o template real */}
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(template)}
                  className="block aspect-[16/9] w-full bg-white rounded-lg overflow-hidden border relative group hover:ring-2 hover:ring-[#BAA05E]/40 transition-all"
                  title="Clique para ver em tamanho real"
                >
                  {template.html_content ? (
                    <>
                      <iframe
                        srcDoc={template.html_content}
                        title={template.name}
                        sandbox="allow-same-origin"
                        scrolling="no"
                        className="border-0 pointer-events-none"
                        style={{
                          // Renderiza em 600x340 (proporção ~16/9), depois escala pra 100% do card
                          width: '600px',
                          height: '340px',
                          transform: 'scale(0.46)',
                          transformOrigin: 'top left',
                        }}
                      />
                      {/* Overlay que aparece no hover convidando a expandir */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
                        <span className="text-white text-[11px] font-medium bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-1">
                          <Eye className="h-3 w-3" /> Ver em tamanho real
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground bg-muted">
                      Sem preview
                    </div>
                  )}
                </button>

                <div>
                  <h3 className="font-medium text-sm truncate">{template.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{template.subject || 'Sem assunto'}</p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{template.category}</Badge>
                    {template.usage_count > 0 && (
                      <span className="text-[10px] text-muted-foreground">{template.usage_count}x usado</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(template.updated_at), 'dd/MM/yy', { locale: ptBR })}
                  </span>
                </div>

                {!selectable && (
                  <div className="flex gap-1 pt-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setPreviewTemplate(template)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onEditTemplate(template.id)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleDuplicate(template)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => handleDelete(template.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EmailPreviewModal
        open={!!previewTemplate}
        onOpenChange={() => setPreviewTemplate(null)}
        html={previewTemplate?.html_content || ''}
        subject={previewTemplate?.subject || ''}
      />
    </div>
  );
}
