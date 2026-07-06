// ============================================================
// extract-cnpj-card
// Recebe PDF ou imagem do Cartão CNPJ (FormData, campo "file")
// e usa Claude Vision (Haiku) pra extrair os dados estruturados.
// Chave da Anthropic via tabela config (getIntegrationKey).
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // ~10MB

const EXTRACTION_PROMPT = `Extraia os dados do Cartao CNPJ deste documento. Retorne APENAS um JSON valido
(sem markdown, sem \`\`\`) com os seguintes campos:

{
  "cnpj": "XX.XXX.XXX/XXXX-XX",
  "razao_social": "...",
  "nome_fantasia": "...",
  "logradouro": "...",
  "numero": "...",
  "complemento": "...",
  "bairro": "...",
  "cep": "XXXXX-XXX",
  "cidade": "...",
  "uf": "XX"
}

Se algum campo nao estiver visivel, use string vazia. Retorne APENAS o JSON.`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Converte bytes pra base64 em chunks (evita stack overflow em arquivos grandes)
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function resolveMediaType(fileType: string, fileName: string): string | null {
  const t = (fileType || "").toLowerCase();
  if (t === "application/pdf") return "application/pdf";
  if (t === "image/png") return "image/png";
  if (t === "image/jpeg" || t === "image/jpg") return "image/jpeg";
  if (t === "image/webp") return "image/webp";

  // Fallback pela extensão (alguns browsers mandam type vazio)
  const name = (fileName || "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return null;
}

// Parse do JSON retornado pelo modelo, com fallback pra markdown/texto solto
function parseModelJson(text: string): Record<string, string> | null {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const anthropicKey = await getIntegrationKey(supabase, "ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return json(
        { error: 'ANTHROPIC_API_KEY não configurada. Peça ao administrador preencher em Configurações → Integrações → API Keys.' },
        400,
      );
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return json({ error: 'Envie o arquivo via FormData no campo "file"' }, 400);
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return json({ error: 'Arquivo não enviado. Envie o campo "file" no FormData.' }, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return json({ error: "Arquivo muito grande. O limite é 10MB." }, 400);
    }

    const mediaType = resolveMediaType(file.type, file.name);
    if (!mediaType) {
      return json({ error: "Formato não suportado. Envie PDF, PNG, JPEG ou WebP." }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64Data = toBase64(bytes);

    // Bloco de conteúdo: document pra PDF, image pra imagens
    const fileBlock =
      mediaType === "application/pdf"
        ? {
            type: "document",
            source: { type: "base64", media_type: mediaType, data: base64Data },
          }
        : {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Data },
          };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [fileBlock, { type: "text", text: EXTRACTION_PROMPT }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[extract-cnpj-card] Erro na API Anthropic:", errText.slice(0, 500));
      return json({ error: "Falha ao processar o documento com IA. Tente novamente." }, 502);
    }

    const data = await response.json();
    const text =
      (data.content || []).find((b: any) => b.type === "text")?.text || "";

    const parsed = parseModelJson(text);
    if (!parsed) {
      console.error("[extract-cnpj-card] JSON inválido retornado:", text.slice(0, 300));
      return json({ error: "Não foi possível extrair os dados do documento. Verifique se é um Cartão CNPJ legível." }, 422);
    }

    return json({ success: true, data: parsed });
  } catch (err: any) {
    console.error("[extract-cnpj-card] Erro:", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
});
