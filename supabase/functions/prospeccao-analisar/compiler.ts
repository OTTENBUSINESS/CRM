// Compila resultados das fontes em diagnóstico final + chama Gemini pra oportunidades

import type { FonteResult } from "./fontes/site.ts";

const GEMINI_MODEL = "gemini-2.5-flash";

export interface Oportunidade {
  titulo: string;
  descricao: string;
  impacto_estimado: string;
  prioridade: "alta" | "media" | "baixa";
  produto_sugerido?: string;
}

export interface DiagnosticoCompilado {
  scores: Record<string, number | null>;
  score_geral: number;
  score_atracao: number | null;
  score_qualificacao: number | null;
  score_conversao: number | null;
  score_retencao: number | null;
  achados: Record<string, any>;
  oportunidades: Oportunidade[];
  resumo_executivo: string;
  custo_total: number;
  fontes_consultadas: string[];
  fontes_falhadas: string[];
  fontes_pendentes: string[];
}

// Mapeamento fonte → pilar
const PILAR_DE_FONTE: Record<string, "atracao" | "qualificacao" | "conversao" | "retencao"> = {
  // ATRAÇÃO — como o lead descobre a marca
  meta_ads: "atracao",
  google_ads: "atracao",
  posicao_google: "atracao",
  google_maps: "atracao",
  instagram: "atracao",
  tiktok: "atracao",
  youtube: "atracao",
  fb_ad_library: "atracao",
  google_ad_library: "atracao",

  // QUALIFICAÇÃO — quando o lead chega, ele se interessa?
  site: "qualificacao",
  pagespeed: "qualificacao",
  facebook: "qualificacao",
  linkedin_company: "qualificacao",
  doctoralia: "qualificacao",

  // CONVERSÃO — vira cliente?
  ifood: "conversao",
  mercado_livre: "conversao",
  tripadvisor: "conversao",

  // RETENÇÃO — fideliza/escala?
  google_reviews: "retencao",
  reclame_aqui: "retencao",
  glassdoor: "retencao",
};

export async function compilarDiagnostico(
  resultados: FonteResult[],
  fontesPedidas: string[],
  pesos: Record<string, number>,
  promptOportunidades: string,
  lead: any,
  geminiKey: string
): Promise<DiagnosticoCompilado> {
  const scores: Record<string, number | null> = {};
  const achados: Record<string, any> = {};
  const consultadas: string[] = [];
  const falhadas: string[] = [];
  const pendentes: string[] = [];
  let custoTotal = 0;

  for (const r of resultados) {
    scores[r.fonte] = r.score;
    // Preserva motivo do skip nos achados pra UI mostrar
    achados[r.fonte] = {
      ...r.achados,
      ...(r.skipped ? { skipped_reason: r.skipped } : {}),
      ...(r.erro ? { erro: r.erro } : {}),
    };
    custoTotal += r.custo;
    if (r.ok) consultadas.push(r.fonte);
    else if (r.skipped) pendentes.push(r.fonte);
    else falhadas.push(r.fonte);
  }

  // Fontes pedidas mas que ainda não tem implementação
  for (const f of fontesPedidas) {
    if (!resultados.find((r) => r.fonte === f)) {
      pendentes.push(f);
    }
  }

  // Score geral ponderado
  const scoreGeral = calcularScoreGeral(scores, pesos);

  // Scores por pilar (média das fontes que caem nesse pilar)
  const scorePilares = calcularScorePilares(scores);

  // Oportunidades via Gemini
  const oportunidadesAndResumo = await gerarOportunidades(
    achados,
    scores,
    scoreGeral,
    promptOportunidades,
    lead,
    geminiKey
  );

  return {
    scores,
    score_geral: scoreGeral,
    score_atracao: scorePilares.atracao,
    score_qualificacao: scorePilares.qualificacao,
    score_conversao: scorePilares.conversao,
    score_retencao: scorePilares.retencao,
    achados,
    oportunidades: oportunidadesAndResumo.oportunidades,
    resumo_executivo: oportunidadesAndResumo.resumo,
    custo_total: custoTotal,
    fontes_consultadas: consultadas,
    fontes_falhadas: falhadas,
    fontes_pendentes: [...new Set(pendentes)],
  };
}

function calcularScorePilares(scores: Record<string, number | null>) {
  const buckets: Record<string, number[]> = {
    atracao: [],
    qualificacao: [],
    conversao: [],
    retencao: [],
  };

  for (const [fonte, score] of Object.entries(scores)) {
    if (score === null) continue;
    const pilar = PILAR_DE_FONTE[fonte];
    if (pilar) buckets[pilar].push(score);
  }

  return {
    atracao: buckets.atracao.length > 0 ? +(media(buckets.atracao)).toFixed(1) : null,
    qualificacao:
      buckets.qualificacao.length > 0 ? +(media(buckets.qualificacao)).toFixed(1) : null,
    conversao: buckets.conversao.length > 0 ? +(media(buckets.conversao)).toFixed(1) : null,
    retencao: buckets.retencao.length > 0 ? +(media(buckets.retencao)).toFixed(1) : null,
  };
}

function media(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calcularScoreGeral(
  scores: Record<string, number | null>,
  pesos: Record<string, number>
): number {
  let totalScore = 0;
  let totalPeso = 0;

  // Mapear nomes de scores → keys de pesos
  const mapping: Record<string, string> = {
    site: "site",
    google_maps: "google_maps",
    instagram: "instagram",
    facebook: "facebook",
    linkedin_company: "linkedin_company",
    youtube: "youtube",
    tiktok: "tiktok",
    doctoralia: "doctoralia",
    reclame_aqui: "reclame_aqui",
    ifood: "ifood",
  };

  for (const [fonte, score] of Object.entries(scores)) {
    if (score === null) continue;
    const pesoKey = mapping[fonte] || fonte;
    const peso = pesos[pesoKey] || 10;
    totalScore += score * peso;
    totalPeso += peso;
  }

  if (totalPeso === 0) return 0;
  return +((totalScore / totalPeso)).toFixed(1);
}

async function gerarOportunidades(
  achados: Record<string, any>,
  scores: Record<string, number | null>,
  scoreGeral: number,
  prompt: string,
  lead: any,
  apiKey: string
): Promise<{ oportunidades: Oportunidade[]; resumo: string }> {
  // Compacta achados pra evitar prompt gigante
  const achadosResumo = Object.entries(achados)
    .filter(([_, v]) => v && typeof v === "object")
    .map(([fonte, v]: [string, any]) => {
      const probs = (v.problemas || []).map((p: any) => `❌ ${p.texto}`).join("\n  ");
      const att = (v.atencao || []).map((a: any) => `⚠️ ${a.texto}`).join("\n  ");
      const pos = (v.positivos || []).map((p: any) => `✅ ${p.texto}`).join("\n  ");
      const score = scores[fonte];
      return `[${fonte.toUpperCase()}] score ${score ?? "—"}/10\n  ${probs}\n  ${att}\n  ${pos}`;
    })
    .join("\n\n");

  const userPrompt = `${prompt}

LEAD: ${lead.nome}${lead.categoria ? ` (${lead.categoria})` : ""}${lead.cidade ? ` em ${lead.cidade}/${lead.uf}` : ""}
Score geral: ${scoreGeral}/10

ACHADOS POR CANAL:
${achadosResumo}

INSTRUÇÕES:
- Identifique 3 oportunidades CONCRETAS de IA que resolvem as dores específicas acima.
- Cada oportunidade deve referenciar um achado específico (não pode ser genérico).
- Tom Frank: direto, sem floreio, fala da dor real.
- prioridade: "alta" se o problema é crítico, "media" se importante, "baixa" se cosmético.

RETORNE APENAS JSON VÁLIDO:
{
  "resumo": "1-2 frases sobre o estado geral do lead e onde IA encaixa",
  "oportunidades": [
    {
      "titulo": "Atendimento WhatsApp 24h com IA",
      "descricao": "X seguidores e site sem WhatsApp — perde lead que quer falar fora do horário. IA atende, qualifica BANT e agenda direto.",
      "impacto_estimado": "+30-50% agendamentos",
      "prioridade": "alta",
      "produto_sugerido": "IA Atendimento WhatsApp"
    }
  ]
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.5,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[compiler] Gemini error:", errText);
      return {
        oportunidades: [],
        resumo: `Score geral ${scoreGeral}/10. Análise automática indisponível no momento.`,
      };
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("[compiler] JSON parse fail:", rawText);
      parsed = {};
    }

    const oportunidades: Oportunidade[] = Array.isArray(parsed.oportunidades)
      ? parsed.oportunidades
          .filter((o: any) => o && typeof o.titulo === "string")
          .map((o: any) => ({
            titulo: o.titulo,
            descricao: o.descricao || "",
            impacto_estimado: o.impacto_estimado || "",
            prioridade: ["alta", "media", "baixa"].includes(o.prioridade) ? o.prioridade : "media",
            produto_sugerido: o.produto_sugerido,
          }))
      : [];

    return {
      oportunidades,
      resumo: parsed.resumo || `Score geral ${scoreGeral}/10`,
    };
  } catch (e) {
    console.error("[compiler] Erro:", e);
    return {
      oportunidades: [],
      resumo: `Score geral ${scoreGeral}/10. ${String(e)}`,
    };
  }
}
