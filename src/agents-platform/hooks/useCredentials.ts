/**
 * useCredentials — CRUD de credenciais de providers IA.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type ProviderType =
  // ─── LLMs ───
  | 'anthropic_api'
  | 'openai_api'
  | 'openai_codex'
  | 'google_gemini'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'deepseek'
  | 'custom'
  // ─── Tools / integrações externas ───
  | 'borapostar'
  | 'buffer'
  | 'scrape_creators'
  | 'gemini_image'
  | 'uazapi'
  | 'jina_reader'
  | 'tavily'
  | 'meta_ads';

export type CredentialCategory = 'llm' | 'tool';

export interface ProviderCredential {
  id: string;
  owner_user_id: string;
  provider_type: ProviderType;
  label: string;
  auth_data: Record<string, any>;
  metadata: Record<string, any>;
  is_active: boolean;
  is_shared: boolean;
  last_used_at: string | null;
  last_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderInfo {
  name: string;
  emoji: string;
  description: string;
  category: CredentialCategory;
  fields: Array<{
    name: string;
    label: string;
    type?: 'text' | 'password';
    placeholder?: string;
    required?: boolean;
    help?: string;
  }>;
  setup_url?: string;     // tutorial pra pegar a key
  setup_steps?: string[]; // passos curtos
}

export const PROVIDER_LABELS: Record<ProviderType, ProviderInfo> = {
  // ─── LLM ───
  openai_codex: {
    name: 'OpenAI Codex (ChatGPT subscription)', emoji: '🆓', category: 'llm',
    description: 'GPT-5.5 via sua sub ChatGPT Plus/Pro — R$ 0 por token',
    fields: [{ name: 'auth_json', label: 'Conteúdo de ~/.codex/auth.json', type: 'password', required: true }],
  },
  anthropic_api: {
    name: 'Anthropic (Claude)', emoji: '🤖', category: 'llm',
    description: 'API key sk-ant-... — pay-per-token',
    fields: [{ name: 'api_key', label: 'API key', type: 'password', placeholder: 'sk-ant-...', required: true }],
    setup_url: 'https://console.anthropic.com/settings/keys',
  },
  openai_api: {
    name: 'OpenAI API', emoji: '🔷', category: 'llm',
    description: 'API key sk-... — pay-per-token',
    fields: [{ name: 'api_key', label: 'API key', type: 'password', placeholder: 'sk-...', required: true }],
    setup_url: 'https://platform.openai.com/api-keys',
  },
  google_gemini: {
    name: 'Google Gemini', emoji: '💎', category: 'llm',
    description: 'Free tier 1500 req/dia',
    fields: [{ name: 'api_key', label: 'API key', type: 'password', required: true }],
    setup_url: 'https://aistudio.google.com/apikey',
  },
  groq: { name: 'Groq (Llama)', emoji: '⚡', category: 'llm', description: 'Free tier 6k tokens/min · super rápido', fields: [{ name: 'api_key', label: 'API key', type: 'password', required: true }] },
  together: { name: 'Together AI', emoji: '🦙', category: 'llm', description: 'Llama, Mistral — bem barato', fields: [{ name: 'api_key', label: 'API key', type: 'password', required: true }] },
  fireworks: { name: 'Fireworks AI', emoji: '🎆', category: 'llm', description: 'Llama, DeepSeek — barato', fields: [{ name: 'api_key', label: 'API key', type: 'password', required: true }] },
  deepseek: { name: 'DeepSeek', emoji: '🧠', category: 'llm', description: 'V3.2 — 21× mais barato que Sonnet', fields: [{ name: 'api_key', label: 'API key', type: 'password', required: true }] },
  custom: { name: 'Custom', emoji: '🔧', category: 'llm', description: 'Endpoint OpenAI-compatible próprio',
    fields: [
      { name: 'api_key', label: 'API key', type: 'password', required: true },
      { name: 'endpoint_url', label: 'Endpoint URL', placeholder: 'https://api.exemplo.com/v1' },
    ],
  },

  // ─── Tools ───
  borapostar: {
    name: 'BoraPostar', emoji: '📝', category: 'tool',
    description: 'Plataforma de carrosseis pro Instagram com renderização automática.',
    fields: [{ name: 'api_key', label: 'X-API-Key da BoraPostar', type: 'password', required: true }],
    setup_url: 'https://borapostar.com/docs/api',
  },
  buffer: {
    name: 'Buffer', emoji: '🎯', category: 'tool',
    description: 'Publica e agenda em YouTube, LinkedIn e múltiplos canais.',
    fields: [
      { name: 'api_key', label: 'Bearer token da Buffer API', type: 'password', required: true },
      { name: 'channel_youtube',         label: 'Channel ID YouTube',       help: 'opcional, pra preencher templates' },
      { name: 'channel_linkedin_personal', label: 'Channel ID LinkedIn pessoal' },
      { name: 'channel_linkedin_company',  label: 'Channel ID LinkedIn empresa' },
    ],
    setup_url: 'https://buffer.com/developers/api',
    setup_steps: [
      'Vai em Buffer → Settings → Account → Connected Apps',
      'Cria um app + token (Bearer)',
      'Cole o token e os Channel IDs',
    ],
  },
  scrape_creators: {
    name: 'ScrapeCreators', emoji: '🔍', category: 'tool',
    description: 'Transcreve vídeos do YouTube e Reels do Instagram.',
    fields: [{ name: 'api_key', label: 'x-api-key', type: 'password', required: true }],
    setup_url: 'https://scrapecreators.com/',
  },
  gemini_image: {
    name: 'Gemini Imagem', emoji: '🎨', category: 'tool',
    description: 'Gera imagens via Google Gemini (gemini-3-pro-image).',
    fields: [{ name: 'api_key', label: 'Gemini API key', type: 'password', required: true, help: 'mesma da Google AI Studio' }],
    setup_url: 'https://aistudio.google.com/apikey',
  },
  uazapi: {
    name: 'UAZAPI WhatsApp', emoji: '📱', category: 'tool',
    description: 'Envia mensagens WhatsApp via API não-oficial.',
    fields: [
      { name: 'api_key', label: 'Token de instância', type: 'password', required: true, help: 'header "token" do UAZAPI' },
      { name: 'base_url', label: 'Base URL', placeholder: 'https://sua-instancia.uazapi.com', help: 'sua instância UAZAPI' },
    ],
    setup_url: 'https://uazapi.com/',
  },
  jina_reader: {
    name: 'Jina Reader', emoji: '🌐', category: 'tool',
    description: 'Lê artigos/notícias da web (texto limpo pra IA). Free tier 10M tokens.',
    fields: [{ name: 'api_key', label: 'Jina API key', type: 'password', required: true, help: 'pega grátis em jina.ai/reader — clica "Get API key"' }],
    setup_url: 'https://jina.ai/reader',
  },
  tavily: {
    name: 'Tavily Search', emoji: '🔎', category: 'tool',
    description: 'Pesquisa na web em tempo real, otimizada pra IA. Free 1000 buscas/mês.',
    fields: [{ name: 'api_key', label: 'Tavily API key', type: 'password', required: true, help: 'pega grátis em tavily.com — começa com tvly-' }],
    setup_url: 'https://app.tavily.com/',
  },
  meta_ads: {
    name: 'Meta Ads (FB + IG)', emoji: '📊', category: 'tool',
    description: 'Gestão de campanhas Meta via Graph API. Use System User Token (não expira).',
    fields: [
      { name: 'token', label: 'System User Token', type: 'password', required: true, help: 'Business Manager → Configurações → Usuários do Sistema → Gerar Token. Escopo: ads_management, ads_read, business_management.' },
      { name: 'ad_account_id', label: 'ID da conta de anúncios', placeholder: '123456789', required: true, help: 'Sem o prefixo "act_". Encontra em Gerenciador de Anúncios → topo da página.' },
    ],
    setup_url: 'https://business.facebook.com/business_users/system_users',
    setup_steps: [
      '1. Abre business.facebook.com',
      '2. Configurações de Negócios → Usuários → Usuários do Sistema',
      '3. Adicionar → cria com cargo "Admin"',
      '4. Em Atribuir Ativos: adiciona tua Conta de Anúncios com "Controle Total"',
      '5. Gerar Token → escolhe a conta + escopo "ads_management, ads_read, business_management" → 60 dias OU "Sem expiração"',
      '6. Cola o token aqui',
    ],
  },
};

export function useCredentials() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { teamMember } = useAuth();

  const query = useQuery({
    queryKey: ['provider-credentials'],
    queryFn: async (): Promise<ProviderCredential[]> => {
      const { data } = await supabase
        .from('agents_provider_credentials')
        .select('*')
        .order('created_at', { ascending: false });
      return (data as ProviderCredential[]) || [];
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (payload: {
      provider_type: ProviderType;
      label: string;
      auth_data: Record<string, any>;
      metadata?: Record<string, any>;
      is_shared?: boolean;
    }) => {
      if (!teamMember?.id) throw new Error('Usuário não identificado');
      const { error, data } = await supabase
        .from('agents_provider_credentials')
        .insert({
          owner_user_id: teamMember.id,
          provider_type: payload.provider_type,
          label: payload.label,
          auth_data: payload.auth_data,
          metadata: payload.metadata || {},
          is_shared: payload.is_shared || false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-credentials'] });
      toast({ title: 'Credencial cadastrada' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ProviderCredential> & { id: string }) => {
      const { error } = await supabase
        .from('agents_provider_credentials')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-credentials'] });
      toast({ title: 'Credencial atualizada' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agents_provider_credentials')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-credentials'] });
      toast({ title: 'Removida' });
    },
  });

  return {
    credentials: query.data || [],
    loading: query.isLoading,
    create: create.mutate,
    update: update.mutate,
    remove: remove.mutate,
    isCreating: create.isPending,
  };
}
