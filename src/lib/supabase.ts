import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

// Montar a anon key em runtime para evitar que o minificador/CDN
// corrompa a string longa do JWT inserindo espaços (bug Netlify asset optimization)
const _anonKeyRaw = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseAnonKey = typeof _anonKeyRaw === 'string'
  ? _anonKeyRaw.replace(/\s+/g, '')
  : _anonKeyRaw;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// In-memory mutex lock para substituir Navigator.locks (que trava em certos browsers)
// e noOpLock (que permitia refreshes concorrentes, corrompendo o client).
// Chamadas concorrentes com o MESMO nome REUTILIZAM o resultado da primeira execução
// (não executam fn() de novo — refresh tokens são single-use).
const inMemoryLock = (() => {
  const locks = new Map<string, Promise<any>>();

  return async <R>(
    name: string,
    acquireTimeout: number,
    fn: () => Promise<R>
  ): Promise<R> => {
    const existing = locks.get(name);

    if (existing) {
      // Já tem uma execução em andamento — reutilizar o resultado dela
      try {
        return await Promise.race([
          existing as Promise<R>,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Lock timeout: ${name}`)), acquireTimeout || 5000)
          ),
        ]);
      } catch {
        // Timeout ou erro — limpar e executar nova tentativa
        locks.delete(name);
      }
    }

    // Executar fn() e registrar a promise
    const promise = fn().finally(() => {
      if (locks.get(name) === promise) {
        locks.delete(name);
      }
    });

    locks.set(name, promise);
    return promise;
  };
})();

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: inMemoryLock,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
