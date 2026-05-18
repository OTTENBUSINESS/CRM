import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Star,
  StarOff,
  Loader2,
  BookOpen,
  Headphones,
  GraduationCap,
  MessageSquare,
  Settings2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useAllCoachPlaybooks,
  useDeleteCoachPlaybook,
  useDuplicateCoachPlaybook,
  useUpdateCoachPlaybook,
} from '@/hooks/useCoachPlaybooks';
import { playbookTypeLabels, type CoachPlaybook, type PlaybookType } from '@/types/coach.types';

interface CoachPlaybookListProps {
  onEdit: (playbook: CoachPlaybook) => void;
  onCreate: () => void;
}

const typeIcons: Record<PlaybookType, React.ReactNode> = {
  sales: <BookOpen className="h-4 w-4" />,
  cs: <Headphones className="h-4 w-4" />,
  onboarding: <GraduationCap className="h-4 w-4" />,
  support: <MessageSquare className="h-4 w-4" />,
  custom: <Settings2 className="h-4 w-4" />,
};

const typeColors: Record<PlaybookType, string> = {
  sales: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  cs: 'bg-green-500/10 text-green-600 border-green-500/20',
  onboarding: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  support: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  custom: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
};

export function CoachPlaybookList({ onEdit, onCreate }: CoachPlaybookListProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<CoachPlaybook | null>(null);

  const { data: playbooks, isLoading } = useAllCoachPlaybooks();
  const deletePlaybook = useDeleteCoachPlaybook();
  const duplicatePlaybook = useDuplicateCoachPlaybook();
  const updatePlaybook = useUpdateCoachPlaybook();

  const filteredPlaybooks = playbooks?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await deletePlaybook.mutateAsync(deleteConfirm.id);
      toast({
        title: 'Playbook removido',
        description: `"${deleteConfirm.name}" foi desativado com sucesso.`,
      });
      setDeleteConfirm(null);
    } catch (error) {
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível remover o playbook.',
        variant: 'destructive',
      });
    }
  };

  const handleDuplicate = async (playbook: CoachPlaybook) => {
    try {
      await duplicatePlaybook.mutateAsync(playbook.id);
      toast({
        title: 'Playbook duplicado',
        description: `Uma cópia de "${playbook.name}" foi criada.`,
      });
    } catch (error) {
      toast({
        title: 'Erro ao duplicar',
        description: 'Não foi possível duplicar o playbook.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleDefault = async (playbook: CoachPlaybook) => {
    try {
      await updatePlaybook.mutateAsync({
        id: playbook.id,
        is_default: !playbook.is_default,
        type: playbook.type,
      });
      toast({
        title: playbook.is_default ? 'Padrão removido' : 'Definido como padrão',
        description: playbook.is_default
          ? `"${playbook.name}" não é mais o playbook padrão.`
          : `"${playbook.name}" agora é o playbook padrão para ${playbookTypeLabels[playbook.type]}.`,
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o status.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Coach Playbooks
            </CardTitle>
            <CardDescription>
              Configure playbooks para auxiliar vendedores em tempo real durante ligações
            </CardDescription>
          </div>
          <Button onClick={onCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Playbook
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar playbooks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !filteredPlaybooks?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            {search ? 'Nenhum playbook encontrado.' : 'Nenhum playbook cadastrado ainda.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Fases</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlaybooks.map((playbook) => (
                <TableRow key={playbook.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{playbook.name}</span>
                      {playbook.is_default && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                    {playbook.description && (
                      <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                        {playbook.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`gap-1 ${typeColors[playbook.type]}`}
                    >
                      {typeIcons[playbook.type]}
                      {playbookTypeLabels[playbook.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">
                      {playbook.phases?.length || 0} fases
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={playbook.is_active ? 'default' : 'outline'}
                      className={playbook.is_active ? 'bg-green-500' : ''}
                    >
                      {playbook.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(playbook)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(playbook)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleDefault(playbook)}>
                          {playbook.is_default ? (
                            <>
                              <StarOff className="h-4 w-4 mr-2" />
                              Remover padrão
                            </>
                          ) : (
                            <>
                              <Star className="h-4 w-4 mr-2" />
                              Definir como padrão
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteConfirm(playbook)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover playbook?</AlertDialogTitle>
            <AlertDialogDescription>
              O playbook "{deleteConfirm?.name}" será desativado. Esta ação pode ser revertida posteriormente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
