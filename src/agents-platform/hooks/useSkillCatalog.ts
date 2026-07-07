/**
 * useSkillCatalog — catálogo de tools pré-built (templates).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CatalogSkill {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  category: string;
  emoji: string | null;
  provider: string | null;     // 'borapostar' | 'buffer' | 'agent_notes' | ...
  parameters_schema: Record<string, any>;
  action_type: 'sql' | 'http' | 'webhook' | 'edge_function';
  action_config: Record<string, any>;
  default_usage_mode: 'always' | 'with_approval' | 'disabled';
  is_recommended: boolean;
}

export function useSkillCatalog() {
  return useQuery({
    queryKey: ['skill-catalog'],
    queryFn: async (): Promise<CatalogSkill[]> => {
      const { data } = await supabase
        .from('agents_skill_catalog')
        .select('*')
        .order('category')
        .order('display_name');
      return (data as CatalogSkill[]) || [];
    },
    staleTime: 5 * 60_000,
  });
}
