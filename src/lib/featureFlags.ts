/**
 * Feature flags do projeto.
 * Controladas via variáveis de ambiente VITE_*.
 * Para ativar o Cockpit V2, defina VITE_COCKPIT_V2=true no .env
 */
export const featureFlags = {
  cockpitV2: import.meta.env.VITE_COCKPIT_V2 === 'true',
} as const;
