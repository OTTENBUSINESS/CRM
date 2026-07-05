import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Filter, UserCheck, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import EmailAudienceBuilder from './EmailAudienceBuilder';
import type { EmailAudienceFilters } from '@/types/email.types';

interface Props {
  filters: EmailAudienceFilters;
  onChange: (filters: EmailAudienceFilters) => void;
}

export default function EmailAudiencePicker({ filters, onChange }: Props) {
  const initialTab: 'filter' | 'specific' = (filters.lead_ids?.length ?? 0) > 0 ? 'specific' : 'filter';
  const [tab, setTab] = useState<'filter' | 'specific'>(initialTab);
  const [search, setSearch] = useState('');

  const leadIds = filters.lead_ids || [];

  const { data: searchResults = [], isLoading: loadingSearch } = useQuery({
    queryKey: ['email-leads-search', search],
    enabled: tab === 'specific',
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('id, name, email, phone')
        .not('email', 'is', null)
        .neq('email', '')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: selectedLeadsData = [] } = useQuery({
    queryKey: ['email-leads-by-ids', leadIds],
    enabled: tab === 'specific' && leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, email')
        .in('id', leadIds);
      if (error) throw error;
      return data || [];
    },
  });

  const selectedMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string | null; email: string | null }>();
    for (const l of selectedLeadsData) map.set(l.id, l);
    for (const l of searchResults) if (leadIds.includes(l.id)) map.set(l.id, l);
    return map;
  }, [selectedLeadsData, searchResults, leadIds]);

  const toggleLead = (id: string) => {
    const next = leadIds.includes(id) ? leadIds.filter(x => x !== id) : [...leadIds, id];
    onChange({ ...filters, lead_ids: next });
  };

  const removeLead = (id: string) => {
    onChange({ ...filters, lead_ids: leadIds.filter(x => x !== id) });
  };

  const switchTab = (v: string) => {
    const next = v as 'filter' | 'specific';
    setTab(next);
    if (next === 'specific') {
      // Limpa filtros, mantém lead_ids
      onChange({ lead_ids: leadIds });
    } else {
      // Limpa lead_ids, mantém filtros
      const { lead_ids, ...rest } = filters;
      onChange(rest);
    }
  };

  return (
    <Tabs value={tab} onValueChange={switchTab}>
      <TabsList className="grid grid-cols-2 w-full max-w-sm">
        <TabsTrigger value="filter" className="gap-2">
          <Filter className="h-3.5 w-3.5" /> Por filtro
        </TabsTrigger>
        <TabsTrigger value="specific" className="gap-2">
          <UserCheck className="h-3.5 w-3.5" /> Leads específicos
        </TabsTrigger>
      </TabsList>

      <TabsContent value="filter" className="mt-4">
        <EmailAudienceBuilder filters={filters} onChange={onChange} />
      </TabsContent>

      <TabsContent value="specific" className="space-y-3 mt-4">
        {selectedMap.size > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Array.from(selectedMap.values()).map(l => (
              <Badge key={l.id} variant="secondary" className="gap-1 pr-1">
                <span className="truncate max-w-[200px]">{l.name || l.email}</span>
                <button
                  type="button"
                  onClick={() => removeLead(l.id)}
                  className="hover:bg-muted rounded-sm p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, email ou telefone..."
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-72 border rounded-lg">
          {loadingSearch ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Carregando...</div>
          ) : searchResults.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {search ? 'Nenhum lead encontrado' : 'Nenhum lead com email cadastrado'}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {searchResults.map(l => {
                const checked = leadIds.includes(l.id);
                return (
                  <label
                    key={l.id}
                    className={cn(
                      'flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all',
                      checked && 'bg-primary/5',
                      !checked && 'hover:bg-muted/50',
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleLead(l.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{l.name || '(sem nome)'}</p>
                      <p className="text-xs text-muted-foreground truncate">{l.email}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <p className="text-xs text-muted-foreground">
          Apenas leads com email e que não pediram descadastro serão incluídos.
        </p>
      </TabsContent>
    </Tabs>
  );
}
