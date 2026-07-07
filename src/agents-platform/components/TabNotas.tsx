/**
 * TabNotas — gerencia notas do agente (criar, editar, ver histórico).
 *
 * Layout split:
 *   - Esquerda: lista de notas com busca/filtro
 *   - Direita: editor markdown lado a lado preview
 *
 * O agente também escreve aqui (via tools salvar_nota/ler_nota). Index auto-injetado no prompt.
 */

import { useState, useMemo } from 'react';
import { Plus, Search, FileText, Trash2, Edit3, Eye, History, Sparkles, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAgentNotes, useNoteVersions, type AgentNote } from '../hooks/useAgentNotes';

interface Props {
  agentId: string;
}

export function TabNotas({ agentId }: Props) {
  const { notes, loading, save, isSaving, remove } = useAgentNotes(agentId);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<AgentNote> | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) || null,
    [notes, selectedId],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter((n) =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      n.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [notes, search]);

  const onNew = () => {
    setSelectedId(null);
    setEditing({ title: '', content: '', tags: [] });
  };

  const onSelectNote = (n: AgentNote) => {
    setSelectedId(n.id);
    setEditing(null);
    setShowVersions(false);
  };

  const onEditExisting = () => {
    if (!selected) return;
    setEditing({
      id: selected.id,
      title: selected.title,
      content: selected.content,
      tags: [...selected.tags],
    });
  };

  const onSaveClick = () => {
    if (!editing?.title?.trim()) return;
    save(
      {
        id: editing.id,
        title: editing.title.trim(),
        content: editing.content || '',
        tags: editing.tags || [],
        author: 'human',
      },
      {
        onSuccess: () => {
          setEditing(null);
        },
      },
    );
  };

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-280px)] min-h-[500px]">
      {/* ───── Esquerda: lista ───── */}
      <aside className="col-span-4 flex flex-col border border-border rounded-xl bg-card overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nota..."
              className="pl-7 h-8 text-xs"
            />
          </div>
          <Button size="icon" className="h-8 w-8 bg-primary hover:bg-primary text-white" onClick={onNew}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {loading && (
            <div className="p-4 text-center text-xs text-muted-foreground">Carregando...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Nenhuma nota ainda.</p>
              <p className="text-[10px] mt-1">O agente vai começar a criar quando você ou ele precisar lembrar de algo.</p>
            </div>
          )}
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelectNote(n)}
              className={cn(
                'w-full text-left p-2.5 rounded-lg border transition-all',
                selectedId === n.id
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-transparent hover:bg-muted/40',
              )}
            >
              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{n.title}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                    {n.content.slice(0, 100) || <span className="italic">vazia</span>}
                  </p>
                  {n.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {n.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[9px] bg-muted text-muted-foreground px-1 py-0.5 rounded">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                    {(n.metadata as any)?.last_author === 'agent' ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" /> agente
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5">
                        <UserIcon className="h-2.5 w-2.5" /> você
                      </span>
                    )}
                    <span>· {formatRelative(n.updated_at)}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ───── Direita: editor / preview ───── */}
      <div className="col-span-8 flex flex-col border border-border rounded-xl bg-card overflow-hidden">
        {/* Empty state */}
        {!selected && !editing && (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-8">
            <FileText className="h-12 w-12 opacity-30 mb-3" />
            <p className="text-sm">Seleciona uma nota à esquerda</p>
            <p className="text-[11px] mt-1">ou clica <strong>+</strong> pra criar uma nova</p>
          </div>
        )}

        {/* Editor (criando OU editando) */}
        {editing && (
          <>
            <div className="p-3 border-b border-border flex items-center gap-2">
              <Input
                value={editing.title || ''}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="Título da nota"
                className="flex-1 text-sm font-medium border-0 focus-visible:ring-0 px-0"
              />
              <Button size="sm" variant="ghost" onClick={() => { setEditing(null); }}>
                Cancelar
              </Button>
              <Button
                size="sm" onClick={onSaveClick}
                disabled={isSaving || !editing.title?.trim()}
                className="bg-primary hover:bg-primary text-white"
              >
                {isSaving ? '...' : 'Salvar'}
              </Button>
            </div>
            <Input
              value={(editing.tags || []).join(', ')}
              onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              placeholder="Tags separadas por vírgula (ex: reels, semana21)"
              className="border-0 border-b border-border rounded-none text-[11px] h-7 focus-visible:ring-0"
            />
            <div className="grid grid-cols-2 flex-1 min-h-0">
              <Textarea
                value={editing.content || ''}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                placeholder="Conteúdo em markdown..."
                className="font-mono text-xs resize-none border-0 border-r border-border rounded-none focus-visible:ring-0 h-full"
              />
              <div className="overflow-y-auto p-4 bg-background/40 prose prose-sm dark:prose-invert max-w-none text-[13px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {editing.content || '_(preview do markdown aparece aqui)_'}
                </ReactMarkdown>
              </div>
            </div>
          </>
        )}

        {/* View existing */}
        {selected && !editing && !showVersions && (
          <>
            <div className="p-4 border-b border-border flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{selected.title}</h3>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                  {selected.tags.map((t) => (
                    <span key={t} className="bg-muted px-1.5 py-0.5 rounded">#{t}</span>
                  ))}
                  <span>· atualizada {formatRelative(selected.updated_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setShowVersions(true)} className="gap-1.5 text-xs">
                  <History className="h-3.5 w-3.5" />
                  Histórico
                </Button>
                <Button size="sm" variant="outline" onClick={onEditExisting} className="gap-1.5 text-xs">
                  <Edit3 className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  size="icon" variant="ghost"
                  className="h-8 w-8 text-red-500 hover:text-red-600"
                  onClick={() => {
                    if (confirm(`Apagar "${selected.title}"?`)) {
                      remove(selected.id);
                      setSelectedId(null);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 prose prose-sm dark:prose-invert max-w-none text-[14px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content || '_(vazia)_'}</ReactMarkdown>
            </div>
          </>
        )}

        {/* Histórico de versões */}
        {selected && showVersions && (
          <VersionHistory note={selected} onClose={() => setShowVersions(false)} />
        )}
      </div>
    </div>
  );
}

function VersionHistory({ note, onClose }: { note: AgentNote; onClose: () => void }) {
  const { data: versions = [] } = useNoteVersions(note.id);

  return (
    <>
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Histórico — {note.title}
        </h3>
        <Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {versions.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            Sem versões anteriores. Snapshots são criados quando o conteúdo muda.
          </p>
        )}
        {versions.map((v) => (
          <div key={v.id} className="border border-border rounded-lg p-3 bg-background">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
              {v.author === 'agent' ? <Sparkles className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
              <span>{v.author === 'agent' ? 'Agente' : 'Você'}</span>
              <span>· {formatRelative(v.created_at)}</span>
            </div>
            <pre className="text-[11px] whitespace-pre-wrap font-mono bg-muted/40 p-2 rounded max-h-32 overflow-y-auto">
              {v.content.slice(0, 500)}{v.content.length > 500 ? '...' : ''}
            </pre>
          </div>
        ))}
      </div>
    </>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
