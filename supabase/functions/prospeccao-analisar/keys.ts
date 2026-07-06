// Chaves de integração resolvidas por request via getIntegrationKey (_shared/config.ts).
// O index.ts preenche este objeto no início do request; as fontes leem daqui
// em vez de Deno.env.get (as chaves ficam na tabela `config`, não em env).
export const integrationKeys: {
  SCRAPECREATORS_API_KEY: string | null;
  GEMINI_API_KEY: string | null;
  GOOGLE_PAGESPEED_KEY: string | null;
} = {
  SCRAPECREATORS_API_KEY: null,
  GEMINI_API_KEY: null,
  GOOGLE_PAGESPEED_KEY: null,
};
