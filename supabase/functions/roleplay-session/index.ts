import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let OPENAI_API_KEY = "";

// ─── Personas pré-definidas ────────────────────────────────────────────
const PERSONAS: Record<string, {
  name: string;
  role: string;
  company: string;
  avatar: string;
  profile: string;
  objections: string[];
  hiddenInfo: Record<string, string>;
}> = {
  roberto_cetico: {
    name: "Roberto Mendes",
    role: "CEO",
    company: "TechNova",
    avatar: "RM",
    profile: `Pragmático, direto, não gosta de papo furado. Já foi enganado por consultorias antes. Quer ver DADOS e CASES concretos. Desconfia de promessas. Fala pouco, escuta com cara de "me convença". Quando não concorda, fica em silêncio ou faz "hm, tá". Tem 45 funcionários e fatura R$8M/ano.`,
    objections: [
      "Isso parece muito genérico, como funciona na prática pro meu segmento?",
      "Já contratei consultoria e não deu resultado, por que seria diferente?",
      "Quanto tempo até eu ver resultado concreto?",
    ],
    hiddenInfo: {
      funcionarios: "45",
      faturamento: "R$8M/ano",
      tentativa_anterior: "Consultoria de processos em 2024, gastou R$60k sem resultado",
      budget: "Até R$15k/mês se convencer",
      decisor: "Ele + CFO (Ana)",
      timeline: "Quer resolver no Q2",
    },
  },
  ana_preco: {
    name: "Ana Oliveira",
    role: "CFO",
    company: "Grupo Fênix",
    avatar: "AO",
    profile: `Analítica, focada em números. Toda decisão passa por ROI. Compara preços, pede planilha, quer saber payback. Educada mas firme — se não vê valor claro, não aprova. Faz muitas perguntas sobre custo x benefício.`,
    objections: [
      "Qual o ROI esperado? Em quanto tempo se paga?",
      "O concorrente X oferece algo parecido por menos, por que eu pagaria mais?",
      "Preciso de um piloto antes de comprometer esse budget",
    ],
    hiddenInfo: {
      funcionarios: "120",
      faturamento: "R$25M/ano",
      tentativa_anterior: "Usa ferramentas internas, mas são limitadas",
      budget: "R$8k-12k/mês aprovado, acima precisa de board",
      decisor: "Ela aprova até R$12k, acima vai pro board",
      timeline: "Q3, sem pressa",
    },
  },
  carlos_tecnico: {
    name: "Carlos Lima",
    role: "CTO",
    company: "DataFlow Systems",
    avatar: "CL",
    profile: `Técnico, já pesquisou sobre o assunto. Conhece concorrentes, sabe terminologia. Quer entender a arquitetura, integrações, e se a equipe técnica vai conseguir usar. Faz perguntas profundas. Se perceber que o vendedor não domina o técnico, perde o interesse.`,
    objections: [
      "Como isso se integra com nossos sistemas atuais?",
      "Vi que o concorrente Y tem feature Z, vocês têm algo equivalente?",
      "Meu time vai precisar de quanto tempo pra implementar?",
    ],
    hiddenInfo: {
      funcionarios: "80 (15 devs)",
      faturamento: "R$15M/ano",
      tentativa_anterior: "Avaliou 3 soluções, nenhuma teve integração boa",
      budget: "R$20k/mês se resolver o problema técnico",
      decisor: "Ele indica, CEO decide",
      timeline: "Urgente — projeto parado esperando solução",
    },
  },
  mariana_indecisa: {
    name: "Mariana Santos",
    role: "Head de RH",
    company: "Wellness Corp",
    avatar: "MS",
    profile: `Simpática, gostou da proposta, mas tem medo de decidir errado. Sempre precisa "falar com alguém" — sócio, diretoria, marido. Adia decisão, pede mais materiais, quer "pensar melhor". Não diz não diretamente, vai enrolando.`,
    objections: [
      "Adorei, mas preciso alinhar com meu diretor antes de decidir",
      "Pode me mandar um material mais detalhado pra eu analisar com calma?",
      "Vou pensar e te retorno na próxima semana, tá?",
    ],
    hiddenInfo: {
      funcionarios: "200",
      faturamento: "R$40M/ano",
      tentativa_anterior: "Nunca contratou algo assim, é a primeira vez",
      budget: "Não sabe, precisa pedir aprovação",
      decisor: "Diretor de operações (Marcos) decide",
      timeline: "Sem deadline definido",
    },
  },
  pedro_apressado: {
    name: "Pedro Almeida",
    role: "Fundador",
    company: "RápidoTech",
    avatar: "PA",
    profile: `Empreendedor serial, impaciente, tem 10 minutos. Vai direto ao ponto. Se o vendedor enrolar, corta. Quer saber: o que faz, quanto custa, quando começa. Não gosta de apresentação longa. Decide rápido — pra sim ou pra não.`,
    objections: [
      "Tá, mas quanto custa? Me dá o número direto",
      "Não tenho tempo pra implementação longa, consigo começar essa semana?",
      "Me convence em 2 minutos por que eu deveria escolher vocês",
    ],
    hiddenInfo: {
      funcionarios: "30",
      faturamento: "R$5M/ano, crescendo 40% ao ano",
      tentativa_anterior: "Faz tudo na raça, nunca terceirizou",
      budget: "Paga na hora se fizer sentido, até R$10k/mês",
      decisor: "Ele decide sozinho",
      timeline: "Ontem. Se não começar essa semana, perde o interesse",
    },
  },
};

// ─── Gerar system prompt ──────────────────────────────────────────────
function buildSystemPrompt(persona: typeof PERSONAS[string], scenario: string, customContext?: string): string {
  const scenarioLabels: Record<string, string> = {
    discovery: "Discovery — primeira conversa, entender necessidade",
    proposal: "Proposta — já conhece a empresa, está avaliando proposta",
    closing: "Fechamento — já viu proposta, está decidindo se fecha",
    objection: "Tratamento de objeções — tem dúvidas e resistências",
  };

  const hiddenInfoText = Object.entries(persona.hiddenInfo)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const objectionsText = persona.objections
    .map((o, i) => `${i + 1}. "${o}"`)
    .join("\n");

  return `Você é ${persona.name}, ${persona.role} da ${persona.company}.

## Seu perfil
${persona.profile}
${customContext ? `\nContexto adicional: ${customContext}` : ""}

## Cenário
Você está em uma reunião de vídeo com um vendedor da IAP (IA na Prática).
Etapa: ${scenarioLabels[scenario] || scenario}

## Regras de comportamento (OBRIGATÓRIAS)
1. NUNCA quebre o personagem. Você É o cliente, não uma IA.
2. Fale naturalmente — use "hm", "entendi", "tá", pausas curtas. Seja conciso nas respostas.
3. Faça perguntas reais que esse perfil faria.
4. Comece com um "Oi, tudo bem? Me conta aí..." casual e deixe o vendedor conduzir.
5. Reaja às respostas do vendedor — se responder bem, mostre interesse. Se responder mal, demonstre dúvida ou resistência.
6. Traga objeções naturalmente ao longo da conversa, não tudo de uma vez.
7. Se o vendedor não perguntar sobre sua dor/necessidade, não entregue de graça — espere ele conduzir.
8. Duração ideal: 8-15 minutos. Se sentir que a call tá travada há mais de 1 minuto, dê uma abertura sutil.
9. NÃO faça monólogos longos. Respostas curtas e naturais, como numa call real.
10. Se o vendedor fizer uma boa pergunta aberta, responda com mais detalhes. Se fizer pergunta fechada, responda curto.

## Objeções que você DEVE trazer (no momento natural):
${objectionsText}

## Informações que você revela APENAS se o vendedor perguntar:
${hiddenInfoText}

## Tom de voz
Fale como um executivo brasileiro em reunião de vídeo. Natural, sem formalidade excessiva. Use "né", "beleza", "show" quando apropriado pro perfil.`;
}

// ─── Handler ──────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const { personaId, customPersona, scenario = "discovery", voice = "ash" } = await req.json();

    let persona;

    if (personaId && PERSONAS[personaId]) {
      persona = PERSONAS[personaId];
    } else if (customPersona) {
      persona = {
        name: customPersona.name || "Cliente",
        role: customPersona.role || "Decisor",
        company: customPersona.company || "Empresa",
        avatar: (customPersona.name || "C").substring(0, 2).toUpperCase(),
        profile: customPersona.context || "Cliente interessado mas cauteloso.",
        objections: customPersona.objections || [
          "Preciso entender melhor como funciona na prática",
          "Qual o diferencial de vocês?",
        ],
        hiddenInfo: {
          budget: customPersona.budget || "Não definido",
          decisor: customPersona.decisionMaker || "A definir",
          timeline: customPersona.timeline || "Sem prazo definido",
        },
      };
    } else {
      throw new Error("personaId ou customPersona é obrigatório");
    }

    const systemPrompt = buildSystemPrompt(persona, scenario, customPersona?.context);

    // Criar client secret via OpenAI Realtime GA API
    const sessionResponse = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime",
          instructions: systemPrompt,
          audio: {
            output: {
              voice: voice,
            },
          },
        },
      }),
    });

    if (!sessionResponse.ok) {
      const error = await sessionResponse.text();
      console.error("OpenAI session error:", error);
      throw new Error(`OpenAI API error: ${sessionResponse.status} - ${error}`);
    }

    const session = await sessionResponse.json();
    console.log("OpenAI client secret created:", JSON.stringify({ id: session.id, expires_at: session.expires_at }));

    // GA response: token is in session.value (not session.client_secret.value)
    const token = session.value || session.client_secret?.value;
    if (!token) {
      console.error("No token in response:", JSON.stringify(session));
      throw new Error("Token não encontrado na resposta da OpenAI");
    }

    return new Response(
      JSON.stringify({
        token,
        expiresAt: session.expires_at,
        persona: {
          name: persona.name,
          role: persona.role,
          company: persona.company,
          avatar: persona.avatar,
        },
        personas: personaId ? undefined : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Roleplay session error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
