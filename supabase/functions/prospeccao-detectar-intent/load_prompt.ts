// Helper compartilhado: busca prompt configurável da tabela prospeccao_prompts_config
// Aceita variáveis {{key}} e substitui pelo valor de `vars`.
// Se o prompt não existir no banco, usa o fallback hardcoded passado.

interface PromptConfig {
  prompt_text: string;
  ai_model: string;
  temperature: number;
}

export async function loadPrompt(
  supabase: any,
  key: string,
  vars: Record<string, string | number | undefined | null>,
  fallback: PromptConfig
): Promise<PromptConfig> {
  let cfg: PromptConfig = fallback;

  try {
    const { data } = await supabase
      .from("prospeccao_prompts_config")
      .select("prompt_text, ai_model, temperature, is_active")
      .eq("key", key)
      .eq("is_active", true)
      .maybeSingle();
    if (data?.prompt_text) {
      cfg = {
        prompt_text: data.prompt_text,
        ai_model: data.ai_model || fallback.ai_model,
        temperature: data.temperature ?? fallback.temperature,
      };
    }
  } catch {
    // fallback
  }

  // Substitui variáveis {{key}}
  let rendered = cfg.prompt_text;
  for (const [k, v] of Object.entries(vars)) {
    const value = v === null || v === undefined ? "" : String(v);
    rendered = rendered.replaceAll(`{{${k}}}`, value);
  }

  return {
    prompt_text: rendered,
    ai_model: cfg.ai_model,
    temperature: cfg.temperature,
  };
}
