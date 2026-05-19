import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { Shield, UserX, UserCheck, Trash2, Users, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

/* ---------- types ---------- */
interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  auth_user_id: string | null;
}

/* ---------- role labels ---------- */
const ROLE_LABELS: Record<string, string> = {
  vendedor:     'Vendedor',
  designer:     'Designer',
  social_media: 'Social Media',
  diretor:      'Diretor',
  gerente:      'Gerente',
  admin:        'Administrador',
  programador:  'Programador',
  social_seller:'Social Seller',
  cs:           'CS',
  comercial:    'Comercial',
  closer:       'Closer',
  sdr:          'SDR',
  geral:        'Geral',
  user:         'Usuário',
};

/* ---------- helper ---------- */
function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

function roleColor(role: string) {
  if (role === 'admin')   return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  if (role === 'diretor') return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
  if (role === 'gerente') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  return 'bg-white/5 text-white/50 border-white/10';
}

/* ================================================================
 * AdminUsers page
 * ================================================================ */
export default function AdminUsers() {
  const { canManageUsers, teamMember: me } = useAuth();

  const [users, setUsers]           = useState<ManagedUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [confirm, setConfirm]       = useState<{
    type: 'block' | 'unblock' | 'remove';
    user: ManagedUser;
  } | null>(null);
  const [acting, setActing]         = useState(false);

  /* guard */
  if (!canManageUsers) return <Navigate to="/comercial" replace />;

  /* ---- load ---- */
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('team_members')
      .select('id, email, name, role, is_active, created_at, auth_user_id')
      .order('name');

    if (error) {
      toast.error('Erro ao carregar usuários');
    } else {
      setUsers((data ?? []) as ManagedUser[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ---- filter ---- */
  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (ROLE_LABELS[u.role] ?? u.role).toLowerCase().includes(q)
    );
  });

  /* ---- actions ---- */
  const handleConfirm = async () => {
    if (!confirm) return;
    setActing(true);
    const { type, user } = confirm;

    try {
      if (type === 'block') {
        const { error } = await supabase
          .from('team_members')
          .update({ is_active: false })
          .eq('id', user.id);
        if (error) throw error;
        toast.success(`${user.name} bloqueado com sucesso`);
        setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_active: false } : u));
      }

      if (type === 'unblock') {
        const { error } = await supabase
          .from('team_members')
          .update({ is_active: true })
          .eq('id', user.id);
        if (error) throw error;
        toast.success(`${user.name} desbloqueado com sucesso`);
        setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_active: true } : u));
      }

      if (type === 'remove') {
        const { error } = await supabase
          .from('team_members')
          .delete()
          .eq('id', user.id);
        if (error) throw error;
        toast.success(`${user.name} removido do sistema`);
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
      }
    } catch (err: unknown) {
      toast.error('Erro ao executar ação. Tente novamente.');
      console.error(err);
    } finally {
      setActing(false);
      setConfirm(null);
    }
  };

  /* ---- render ---- */
  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 bg-card/30 px-6 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Gerenciar Usuários</h1>
              <p className="text-xs text-muted-foreground">
                {users.length} cadastro{users.length !== 1 ? 's' : ''} · {users.filter((u) => u.is_active).length} ativo{users.filter((u) => u.is_active).length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nome, email ou função..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-4 py-2 text-sm bg-card border border-border/60 rounded-lg outline-none focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/10 w-64 text-foreground placeholder:text-muted-foreground transition-all"
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={load}
              disabled={loading}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Table area */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Carregando usuários...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Users className="w-8 h-8 opacity-30" />
            <p className="text-sm">{search ? 'Nenhum usuário encontrado para essa busca.' : 'Nenhum usuário cadastrado.'}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-card/60">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Usuário</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Função</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cadastro</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, idx) => {
                  const isMe = user.id === me?.id;
                  const canAct = !isMe;

                  return (
                    <tr
                      key={user.id}
                      className={`border-b border-border/40 last:border-0 transition-colors ${
                        idx % 2 === 0 ? 'bg-background' : 'bg-card/20'
                      } ${!user.is_active ? 'opacity-50' : ''}`}
                    >
                      {/* User info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-[11px] font-semibold bg-amber-500/10 text-amber-400">
                              {initials(user.name || user.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate leading-tight">
                              {user.name || '—'}
                              {isMe && (
                                <span className="ml-1.5 text-[10px] text-amber-400/70 font-normal">(você)</span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${roleColor(user.role)}`}>
                          {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {user.is_active ? (
                          <Badge variant="outline" className="text-[11px] border-green-500/30 text-green-400 bg-green-500/10">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px] border-red-500/30 text-red-400 bg-red-500/10">
                            Bloqueado
                          </Badge>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-muted-foreground text-[12px]">
                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {canAct && (
                            <>
                              {user.is_active ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setConfirm({ type: 'block', user })}
                                  className="h-8 px-2.5 text-xs text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 gap-1.5"
                                  title="Bloquear acesso"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                  Bloquear
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setConfirm({ type: 'unblock', user })}
                                  className="h-8 px-2.5 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10 gap-1.5"
                                  title="Desbloquear acesso"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  Desbloquear
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirm({ type: 'remove', user })}
                                className="h-8 px-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5"
                                title="Remover cadastro"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Remover
                              </Button>
                            </>
                          )}
                          {isMe && (
                            <span className="text-[11px] text-muted-foreground px-2">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === 'block'   && 'Bloquear usuário'}
              {confirm?.type === 'unblock' && 'Desbloquear usuário'}
              {confirm?.type === 'remove'  && 'Remover cadastro'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'block' && (
                <>
                  <strong>{confirm.user.name}</strong> perderá acesso imediatamente ao sistema.
                  Você poderá desbloquear depois.
                </>
              )}
              {confirm?.type === 'unblock' && (
                <>
                  <strong>{confirm?.user.name}</strong> voltará a ter acesso ao sistema.
                </>
              )}
              {confirm?.type === 'remove' && (
                <>
                  O cadastro de <strong>{confirm.user.name}</strong> será removido permanentemente.
                  Esta ação <strong>não pode ser desfeita</strong>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={acting}
              onClick={handleConfirm}
              className={
                confirm?.type === 'remove'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : confirm?.type === 'block'
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }
            >
              {acting ? 'Aguarde...' : (
                confirm?.type === 'block'   ? 'Bloquear' :
                confirm?.type === 'unblock' ? 'Desbloquear' :
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
