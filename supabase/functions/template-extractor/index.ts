import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Safe base64 encoding for large buffers (no stack overflow)
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

const EXTRACTION_PROMPT = `# EXTRATOR DE DNA DE CRIATIVOS v4.0

## IDENTIDADE
Você é um Analista de Design de Conversão. Sua função é receber uma imagem de criativo publicitário e extrair os PRINCÍPIOS que fazem ele funcionar.

Você NÃO copia elementos literais. Você MODELA princípios reutilizáveis.

**COPIAR** = "Tem losango azul no fundo"
**MODELAR** = "Elemento gráfico cria profundidade (pode ser losango, hexágono, linhas, gradiente)"

## PROCESSO
1. Análise estratégica: qual objetivo de conversão?
2. Contexto de uso: quando usar este template?
3. Mapeamento de estrutura: hierarquia visual e zonas
4. Princípios visuais: cores por função, proporções, espaçamento
5. Tipografia: hierarquia, pesos, tamanhos relativos
6. Copy: regras de headline, suporte, CTA
7. Nome e descrição: título curto e descritivo
8. **IMPORTANTE - Detecção de foto de expert/pessoa**: Analise se o criativo contém uma foto de uma pessoa real (expert, especialista, influenciador, professor). Se NÃO contiver foto de pessoa, marque has_expert_photo como false.

## OUTPUT OBRIGATÓRIO
Retorne APENAS um bloco JSON (sem texto antes ou depois) com esta estrutura EXATA:

\`\`\`json
{
  "nome": "Nome descritivo do template (3-5 palavras)",
  "descricao": "Descrição de 1-2 frases do que é este template e quando usar",
  "has_expert_photo": true,
  "estrategia": {
    "objetivo": "Ex: Gerar urgência para evento",
    "emocao": "Ex: FOMO + curiosidade",
    "nivel_consciencia": "Ex: Consciente do problema, buscando solução",
    "contexto_uso": ["Quando usar 1", "Quando usar 2", "Quando usar 3"]
  },
  "estrutura": {
    "formato": "Ex: 9:16 stories / 1:1 feed / 16:9 landscape",
    "zonas": [
      { "nome": "Zona superior", "conteudo": "O que vai nesta zona", "proporcao": "30%" },
      { "nome": "Zona central", "conteudo": "O que vai nesta zona", "proporcao": "40%" },
      { "nome": "Zona inferior", "conteudo": "O que vai nesta zona", "proporcao": "30%" }
    ],
    "hierarquia_leitura": [
      { "ordem": 1, "elemento": "Primeiro elemento que o olho vê" },
      { "ordem": 2, "elemento": "Segundo elemento" },
      { "ordem": 3, "elemento": "Terceiro elemento" }
    ]
  },
  "principios_visuais": {
    "fundo": "Descrição do princípio do fundo (cor sólida, gradiente, textura, foto)",
    "contraste": "Como o contraste é usado para hierarquia",
    "espacamento": "Princípios de espaçamento e respiro",
    "estilo_geral": "Ex: Moderno minimalista, Bold corporativo, etc"
  },
  "elemento_principal": {
    "tipo": "Ex: Foto de pessoa, Ilustração, Ícone, Mockup, Texto puro",
    "principio": "Como o elemento principal funciona na composição",
    "requisitos": ["Requisito 1", "Requisito 2"]
  },
  "identificacao_autoridade": {
    "tipo": "Ex: Logo, Foto do especialista, Selo, Nome, Nenhuma",
    "posicao": "Ex: Topo esquerdo, Rodapé central",
    "principio": "Como a autoridade é construída visualmente"
  },
  "principios_tipograficos": {
    "hierarquia": "Quantos níveis tipográficos e como se relacionam",
    "headline": { "peso": "Ex: Extra Bold", "tamanho_relativo": "Ex: O maior texto da composição", "estilo": "Ex: Caixa alta, mixed case" },
    "corpo": { "peso": "Ex: Regular/Medium", "tamanho_relativo": "Ex: 40% do headline" },
    "destaque": "Como palavras-chave são destacadas (cor, negrito, sublinhado)"
  },
  "principios_copy": {
    "headline": { "max_palavras": 7, "estilo": "Ex: Direto, provocativo, pergunta" },
    "suporte": { "max_linhas": 3, "funcao": "Ex: Complementar headline com benefício" },
    "cta": { "estilo": "Ex: Botão com urgência, Link discreto, Seta" }
  },
  "paleta": {
    "primaria": "#hex - função (ex: fundo, destaque)",
    "secundaria": "#hex - função",
    "destaque": "#hex - função",
    "texto_principal": "#hex",
    "texto_secundario": "#hex",
    "principio": "Ex: Alto contraste preto/amarelo para urgência"
  },
  "prompt_base": "PROMPT COMPLETO E DETALHADO (mínimo 500 palavras) para gerar uma imagem similar usando IA. Deve incluir: descrição completa da composição, posições exatas (use porcentagens), cores por função (não literais), tipografia, elementos visuais, estilo artístico. Use placeholders entre colchetes para conteúdo variável: [HEADLINE], [SUBTITULO], [CTA], [NOME_AUTORIDADE], [COR_PRIMARIA], [COR_DESTAQUE]. IMPORTANTE: Se has_expert_photo for true, inclua instruções para posicionar a foto do expert. Se for false, NÃO mencione foto de expert/pessoa no prompt — foque apenas nos elementos gráficos e textuais.",
  "armadilhas": [
    "Não copiar literalmente X, modelar o princípio Y",
    "Não usar cor específica, usar função da cor",
    "Não fixar posição em pixels, usar proporções"
  ],
  "checklist_pre_geracao": [
    "Verificar se headline tem no máximo X palavras",
    "Verificar contraste de legibilidade",
    "Verificar se placeholders foram preenchidos"
  ]
}
\`\`\`

## REGRAS ABSOLUTAS
- MODELAR, nunca copiar. Proporções, não pixels. Funções, não valores literais.
- prompt_base DEVE ter no mínimo 500 palavras e ser extremamente detalhado
- Placeholders obrigatórios no prompt_base: [HEADLINE], [SUBTITULO], [CTA]
- has_expert_photo DEVE ser true se a imagem contém foto de pessoa real (expert, influenciador, professor). false se NÃO contém foto de pessoa (apenas gráficos, ícones, texto, mockups, ilustrações).
- Se has_expert_photo é false, o prompt_base NÃO deve conter instruções sobre foto de expert/pessoa
- Retorne APENAS o JSON, sem texto explicativo antes ou depois
- O JSON deve ser válido e parseable`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, imageUrl } = await req.json();
    const GEMINI_API_KEY = (await getIntegrationKey(supabase, "GEMINI_API_KEY"));
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");

    console.log("Template Extractor v8 - Starting extraction...");
    console.log("imageBase64 present:", !!imageBase64, "imageUrl present:", !!imageUrl);

    let imageData: string;
    let mimeType = "image/jpeg";
    if (imageBase64) {
      if (imageBase64.startsWith('data:')) {
        const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) { mimeType = matches[1]; imageData = matches[2]; } else { imageData = imageBase64; }
      } else { imageData = imageBase64; }
    } else if (imageUrl) {
      console.log("Fetching image from URL:", imageUrl.substring(0, 100));
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      const bytes = new Uint8Array(imageBuffer);
      console.log(`Image fetched: ${bytes.length} bytes`);
      imageData = uint8ArrayToBase64(bytes);
      const ct = imageResponse.headers.get('content-type') || '';
      if (ct.includes('png')) mimeType = 'image/png';
      else if (ct.includes('webp')) mimeType = 'image/webp';
      else if (ct.includes('jpeg') || ct.includes('jpg')) mimeType = 'image/jpeg';
    } else { throw new Error("Nenhuma imagem fornecida"); }

    const payloadSizeKB = Math.round(imageData!.length / 1024);
    console.log(`Image payload: ${payloadSizeKB}KB, mimeType: ${mimeType}`);

    const modelName = "gemini-2.5-flash";
    console.log(`Using model: ${modelName}`);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: imageData! } }, { text: EXTRACTION_PROMPT }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 32768,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.text();
      console.error(`Gemini API error ${geminiResponse.status}:`, errBody.substring(0, 500));
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();

    // Handle thinking models: find the text part (skip thinking parts)
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    let responseText = "";
    for (const part of parts) {
      if (part.text && !part.thought) {
        responseText = part.text;
      }
    }
    if (!responseText) responseText = parts?.[0]?.text || "";

    console.log(`Gemini response length: ${responseText.length} chars`);

    let template = null;

    let jsonString = "";
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonString = jsonMatch[1].trim();
    if (!jsonString) { const codeMatch = responseText.match(/```\s*([\s\S]*?)\s*```/); if (codeMatch && codeMatch[1].trim().startsWith('{')) jsonString = codeMatch[1].trim(); }
    if (!jsonString) { const rawMatch = responseText.match(/\{[\s\S]*"nome"[\s\S]*"prompt_base"[\s\S]*\}/); if (rawMatch) jsonString = rawMatch[0]; }
    if (!jsonString && responseText.trim().startsWith('{')) { jsonString = responseText.trim(); }

    if (jsonString) {
      try {
        jsonString = jsonString.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '');
        template = JSON.parse(jsonString);
        console.log("JSON parsed successfully, template nome:", template.nome, "has_expert_photo:", template.has_expert_photo);
      } catch (parseError) {
        console.error("JSON parse error, trying cleanup...", parseError);
        try {
          jsonString = jsonString.replace(/:\s*"([^"]*?)"/g, (_match: string, content: string) => {
            const escaped = content.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
            return `: "${escaped}"`;
          });
          template = JSON.parse(jsonString);
          console.log("JSON parsed after cleanup, template nome:", template.nome, "has_expert_photo:", template.has_expert_photo);
        } catch (e) {
          console.error("Final parse failed. First 200 chars:", jsonString.substring(0, 200));
        }
      }
    } else {
      console.error("No JSON found in response. First 300 chars:", responseText.substring(0, 300));
    }

    if (template) {
      // Detect has_expert_photo from multiple signals if not explicitly set
      let hasExpertPhoto = template.has_expert_photo;
      if (typeof hasExpertPhoto !== 'boolean') {
        const elementoTipo = (template.elemento_principal?.tipo || '').toLowerCase();
        const autoridadeTipo = (template.identificacao_autoridade?.tipo || '').toLowerCase();
        hasExpertPhoto =
          elementoTipo.includes('foto') || elementoTipo.includes('pessoa') || elementoTipo.includes('expert') ||
          autoridadeTipo.includes('foto') || autoridadeTipo.includes('especialista');
        console.log(`has_expert_photo auto-detected: ${hasExpertPhoto} (elemento: ${elementoTipo}, autoridade: ${autoridadeTipo})`);
      }

      const dbTemplate = {
        nome: template.nome || "Template Extraído",
        descricao: template.descricao || "",
        has_expert_photo: hasExpertPhoto,
        estrategia: template.estrategia || {},
        estrutura: template.estrutura || {},
        principios_visuais: template.principios_visuais || {},
        elemento_principal: template.elemento_principal || {},
        identificacao_autoridade: template.identificacao_autoridade || {},
        principios_tipograficos: template.principios_tipograficos || {},
        principios_copy: template.principios_copy || {},
        paleta: template.paleta || {},
        prompt_base: template.prompt_base || "",
        armadilhas: template.armadilhas || [],
        checklist_pre_geracao: template.checklist_pre_geracao || [],
        reference_image_url: imageUrl || null,
      };

      return new Response(JSON.stringify({
        success: true,
        template: dbTemplate,
        prompt_base_word_count: template.prompt_base?.split(/\s+/).length || 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: "Não foi possível extrair o template do JSON retornado pela IA",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("Error in template extractor:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
