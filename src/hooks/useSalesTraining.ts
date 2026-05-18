import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface TrainingCase {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  outcome: string;
  transcript?: string;
  ai_analysis?: {
    score: number;
    strong_points: string[];
    improvement: string[];
    result: string;
  };
  tags?: string[];
  duration_seconds?: number;
  is_public?: boolean;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

interface FiltersInput {
  category?: string;
  outcome?: string;
  difficulty?: string;
  search?: string;
}

export function useSalesTrainingCases(filters: FiltersInput = {}) {
  return useQuery({
    queryKey: ['training_cases', filters],
    queryFn: async () => {
      let query = (supabase as any)
        .from('training_cases')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.category && filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }
      if (filters.outcome && filters.outcome !== 'all') {
        query = query.eq('outcome', filters.outcome);
      }
      if (filters.difficulty && filters.difficulty !== 'all') {
        query = query.eq('difficulty', filters.difficulty);
      }
      if (filters.search) {
        query = query.ilike('title', `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TrainingCase[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateTrainingCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<TrainingCase>) => {
      const { data, error } = await (supabase as any)
        .from('training_cases')
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      return data as TrainingCase;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training_cases'] });
    },
  });
}

export function useDeleteTrainingCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('training_cases')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training_cases'] });
    },
  });
}
