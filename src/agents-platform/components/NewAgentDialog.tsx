/**
 * NewAgentDialog — wizard pra criar agente novo.
 * Lê os TEMPLATES do banco (is_template=true), clona de verdade via RPC
 * agent_create_from_template (copia tools + interpola variáveis + herda credencial).
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AgentAvatar } from './AgentAvatar';
import { cn } from '@/lib/utils';

interface TemplateVar { key: string; label: string; default?: string; required?: boolean }
interface TemplateRow {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  emoji: string | null;
  avatar_color: string;
  template_variables: TemplateVar[] | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Lista os templates disponíveis (moldes do banco). */
function useTemplates() {
  return useQuery({
    queryKey: ['agent-templates'],
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data } = await supabase
        .from('agents_registry')
        .select('id, slug, display_name, description, emoji, avatar_color, template_variables')
        .eq('is_template', true)
        .order('display_name');
      return (data as TemplateRow[]) || [];
    },
    staleTime: 60_000,
  });
}

export function NewAgentDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const qc = useQueryClient();
  const { data: templates = [], isLoading: loadingTemplates } = useTemplates();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [vars, setVars] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const selected = useMemo(() => templates.find((t) => t.id === selectedId) || null, [templates, selectedId]);

  const pickTemplate = (t: TemplateRow) => {
    setSelectedId(t.id);
    setName(t.display_name.replace(/^TEMPLATE:\s*/i, ''));
    // pré-preenche variáveis com os defaults
    const init: Record<string, string> = {};
    (t.template_variables || []).forEach((v) => { init[v.key] = v.default || ''; });
    setVars(init);
  };

  const onCreate = async () => {
    if (!selected) { toast({ title: 'Escolhe um template', variant: 'destructive' }); return; }
    if (!name.trim()) { toast({ title: 'Dá um nome pro agente', variant: 'destructive' }); return; }
    // valida variáveis obrigatórias
    const missing = (selected.template_variables || []).filter((v) => v.required && !vars[v.key]?.trim());
    if (missing.length) {
      toast({ title: `Preenche: ${missing.map((m) => m.label).join(', ')}`, variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const slug = slugify(name);
      const { data, error } = await supabase.rpc('agent_create_from_template', {
        p_template_id: selected.id,
        p_name: name.trim(),
        p_slug: slug,
        p_emoji: selected.emoji,
        p_color: selected.avatar_color,
        p_description: selected.description,
        p_vars: vars,
        p_credential_id: null,        // herda a credencial do template
        p_created_by: teamMember?.id || null,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['agents-platform-list'] });
      toast({ title: 'Agente criado', description: `${name} pronto — com tools e prompt do template` });
      onClose();
      navigate(`/agentes/${data || slug}/config`);
    } catch (e: any) {
      toast({ title: 'Erro ao criar', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-4 top-[8vh] bottom-[8vh] max-w-2xl mx-auto bg-background border border-border rounded-2xl z-50 shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Novo agente</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Escolhe um template pronto — vem com prompt, tools e tudo configurado
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Templates do banco */}
          <div>
            <Label>Template</Label>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando templates...
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-2">Nenhum template disponível.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2 mt-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => pickTemplate(t)}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-xl border text-left transition-all',
                      selectedId === t.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30',
                    )}
                  >
                    <AgentAvatar name={t.display_name} color={t.avatar_color} emoji={t.emoji} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.display_name.replace(/^TEMPLATE:\s*/i, '')}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                        {(t.description || '').replace(/^TEMPLATE:\s*/i, '')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <>
              {/* Nome do agente */}
              <div>
                <Label>Nome do agente</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Gestor de Time, Bella, Vinícius..."
                  className="mt-1.5"
                />
                {name && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Endereço: <code>/agentes/{slugify(name)}</code>
                  </p>
                )}
              </div>

              {/* Variáveis do template (personalização) */}
              {(selected.template_variables || []).length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <p className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Personalize o agente
                  </p>
                  {(selected.template_variables || []).map((v) => (
                    <div key={v.key}>
                      <Label className="text-xs">
                        {v.label}{v.required ? ' *' : ' (opcional)'}
                      </Label>
                      <Input
                        value={vars[v.key] || ''}
                        onChange={(e) => setVars((p) => ({ ...p, [v.key]: e.target.value }))}
                        className="mt-1 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                ✓ Vem com todas as ferramentas e o prompt do template. Você ajusta o resto na configuração.
              </p>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border bg-card flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            onClick={onCreate}
            disabled={creating || !selected || !name.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar agente'}
          </Button>
        </div>
      </div>
    </>
  );
}
