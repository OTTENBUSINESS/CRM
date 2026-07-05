import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEmailUnsubscribes, useManualUnsubscribe } from '@/hooks/useEmailMarketing';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function EmailUnsubscribeList() {
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const { data, isLoading } = useEmailUnsubscribes(page);
  const manualUnsub = useManualUnsubscribe();
  const { toast } = useToast();

  const unsubscribes = data?.unsubscribes || [];
  const total = data?.total || 0;
  const pageSize = 50;
  const totalPages = Math.ceil(total / pageSize);

  const sourceLabels: Record<string, string> = {
    link: 'Link',
    manual: 'Manual',
    brevo_webhook: 'Brevo',
    complaint: 'Spam',
  };

  const handleAdd = async () => {
    if (!email) {
      toast({ title: 'Informe o email', variant: 'destructive' });
      return;
    }
    try {
      await manualUnsub.mutateAsync({ email, reason });
      toast({ title: 'Email descadastrado' });
      setShowAdd(false);
      setEmail('');
      setReason('');
    } catch (err: any) {
      toast({ title: err.message || 'Erro', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Descadastros ({total})</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Descadastrar Email
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Fonte</TableHead>
                <TableHead className="text-xs">Motivo</TableHead>
                <TableHead className="text-xs">Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unsubscribes.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="text-xs font-medium">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">{sourceLabels[u.source] || u.source}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.reason || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(u.unsubscribed_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                  </TableCell>
                </TableRow>
              ))}
              {unsubscribes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum descadastro</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-end items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">{page + 1}/{totalPages}</span>
          <Button variant="ghost" size="sm" className="h-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Descadastrar Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div>
              <Label>Motivo (opcional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Solicitou por telefone" />
            </div>
            <Button className="w-full" onClick={handleAdd} disabled={manualUnsub.isPending}>
              Descadastrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
