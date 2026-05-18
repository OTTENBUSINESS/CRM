import { createClient } from '@supabase/supabase-js';

// Cliente Supabase para o banco da Área de Membros (PAIN)
const PAIN_SUPABASE_URL = import.meta.env.VITE_PAIN_SUPABASE_URL || 'https://YOUR_PAIN_PROJECT_REF.supabase.co';
const PAIN_SUPABASE_ANON_KEY = import.meta.env.VITE_PAIN_SUPABASE_ANON_KEY || '';

export const supabasePain = createClient(PAIN_SUPABASE_URL, PAIN_SUPABASE_ANON_KEY);
