import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { UserMinus, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ExcludedLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface Props {
  excludeLeadIds: string[];
  onChange: (ids: string[]) => void;
}

export default function ExcludeLeadsSection({ excludeLeadIds, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ExcludedLead[]>([]);
  const [excludedLeads, setExcludedLeads] = useState<ExcludedLead[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const q = `%${query.trim()}%`;
        const { data, error } = await supabase
          .from('leads' as any)
          .select('id, name, phone, email')
          .or(`name.ilike.${q},phone.ilike.${q},email.ilike.${q}`)
          .limit(20);

        if (!error && data) {
          setResults(data as ExcludedLead[]);
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Load excluded lead details when IDs exist but details don't
  useEffect(() => {
    if (excludeLeadIds.length === 0) {
      setExcludedLeads([]);
      return;
    }
    // Only load if we have IDs not yet in excludedLeads
    const missingIds = excludeLeadIds.filter(id => !excludedLeads.some(l => l.id === id));
    if (missingIds.length === 0) return;

    (async () => {
      const { data } = await supabase
        .from('leads' as any)
        .select('id, name, phone, email')
        .in('id', missingIds);
      if (data) {
        setExcludedLeads(prev => {
          const existing = prev.filter(l => excludeLeadIds.includes(l.id));
          return [...existing, ...(data as ExcludedLead[])];
        });
      }
    })();
  }, [excludeLeadIds]);

  const toggleExclude = useCallback((lead: ExcludedLead) => {
    if (excludeLeadIds.includes(lead.id)) {
      onChange(excludeLeadIds.filter(id => id !== lead.id));
      setExcludedLeads(prev => prev.filter(l => l.id !== lead.id));
    } else {
      onChange([...excludeLeadIds, lead.id]);
      setExcludedLeads(prev => [...prev, lead]);
    }
  }, [excludeLeadIds, onChange]);

  const removeExcluded = useCallback((id: string) => {
    onChange(excludeLeadIds.filter(i => i !== id));
    setExcludedLeads(prev => prev.filter(l => l.id !== id));
  }, [excludeLeadIds, onChange]);

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <UserMinus className="h-4 w-4" />
            Excluir contatos especificos
          </CardTitle>
          {excludeLeadIds.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              {excludeLeadIds.length} excluido{excludeLeadIds.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Excluded chips */}
        {excludedLeads.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {excludedLeads.map(lead => (
              <Badge
                key={lead.id}
                variant="secondary"
                className="text-xs flex items-center gap-1 pr-1"
              >
                {lead.name}
                {lead.phone && <span className="text-muted-foreground">({lead.phone.slice(-4)})</span>}
                <button
                  onClick={() => removeExcluded(lead.id)}
                  className="ml-0.5 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nome, telefone ou email..."
            className="h-9 pl-8 text-sm"
          />
        </div>

        {/* Search results */}
        {isSearching && (
          <p className="text-xs text-muted-foreground">Buscando...</p>
        )}
        {results.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-1.5">
            {results.map(lead => (
              <label
                key={lead.id}
                className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted/50 text-sm"
              >
                <Checkbox
                  checked={excludeLeadIds.includes(lead.id)}
                  onCheckedChange={() => toggleExclude(lead)}
                />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{lead.name}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {lead.phone && <span>{lead.phone}</span>}
                    {lead.email && <span>{lead.email}</span>}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
        {query.trim().length >= 2 && results.length === 0 && !isSearching && (
          <p className="text-xs text-muted-foreground">Nenhum lead encontrado.</p>
        )}
      </CardContent>
    </Card>
  );
}
