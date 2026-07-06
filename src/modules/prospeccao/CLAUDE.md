# CLAUDE.md — Módulo Prospecção (interno)

> Este arquivo é lido automaticamente pelo Claude Code quando ele trabalha em arquivos dentro de `src/modules/prospeccao/`. Use o contexto pra fazer mudanças sem quebrar regras invioláveis.

---

## Visão geral em 1 minuto

Vendedor digita query livre → IA descobre leads via Maps → vendedor seleciona quais analisar → 14+ fontes raspadas em paralelo → IA compila score por pilar + 3 oportunidades → PDF estilo consultoria + DM personalizada → vendedor decide quem vira lead+deal no CRM.

**2 mundos isolados:** descoberta (`prospeccao_*`) ↔ CRM (`leads`, `deals`). Conexão única: botão "Virar Lead" no diagnóstico.

---

## Arquitetura

```
┌──── FRONT (React) ────────────────┐    ┌──── EDGE FUNCTIONS (Deno) ────────┐
│                                   │    │                                    │
│ pages/ProspeccaoSearch ────────────┼─→──┤ prospeccao-detectar-intent       │
│   (Tela 1: query livre)           │    │   (Gemini Flash interpreta query)  │
│                                   │    │                                    │
│ pages/ProspeccaoSearch ────────────┼─→──┤ prospeccao-buscar                 │
│   (lista @maps)                   │    │   (Firecrawl Maps → leads brutos) │
│                                   │    │                                    │
│ pages/ProspeccaoSearch ────────────┼─→──┤ prospeccao-direct-lead            │
│   (modo @ ou URL)                 │    │   (cria 1 lead com cross-discovery)│
│                                   │    │                                    │
│ pages/ProspeccaoDescobertos ───────┼─→──┤ prospeccao-analisar               │
│   (seleciona N leads)             │    │   (orquestra 14+ fontes paralelas)│
│                                   │    │   ├ fontes/site.ts                │
│                                   │    │   ├ fontes/instagram.ts (IA)      │
│                                   │    │   ├ fontes/maps.ts                │
│                                   │    │   ├ ... (11 outras fontes)        │
│                                   │    │   ├ extract_phone.ts              │
│                                   │    │   └ compiler.ts (Gemini → ops)    │
│                                   │    │                                    │
│ pages/ProspeccaoDiagnostico ──── ─ │    │                                    │
│   (dashboard 14 canais)           │    │                                    │
│                                   │    │                                    │
│ pages/ProspeccaoDiagnosticoPrint ─ │    │                                    │
│   (PDF v3 — 8 páginas A4)          │    │                                    │
│                                   │    │                                    │
│ components/VirarLeadModal ─────────┼─→──┤ prospeccao-virar-lead             │
│   (lead+deal no CRM)              │    │   (insert em leads + deals)        │
│                                   │    │                                    │
│ components/EnviarDiagnosticoModal ─┼─→──┤ prospeccao-gerar-mensagem         │
│   (3 canais: WA + IG + email)     │    │   (Gemini gera DM tom Frank)       │
└───────────────────────────────────┘    └────────────────────────────────────┘
                  │                                       │
                  └────────────── DB Supabase ────────────┘
                  • prospeccao_buscas (toda busca)
                  • prospeccao_leads_descobertos (1 row por lead)
                  • prospeccao_diagnosticos (1 row por análise)
                  • prospeccao_templates_nicho (config por nicho)
                  • prospeccao_prompts_config (prompts editáveis pela UI)
                  • prospeccao_uso_api (auditoria de chamadas externas)
```

---

## Mapa de arquivos

### `pages/`
- **ProspeccaoSearch.tsx** — Tela 1 (raiz `/comercial/prospeccao`). Query livre + auto-detect IG/URL/busca + recentes
- **ProspeccaoDescobertos.tsx** — Tela 2 (`/busca/:id`). Lista descobertos, filtros, seleção, botão "Analisar"
- **ProspeccaoDiagnostico.tsx** — Tela 3 (`/diagnostico/:id`). Dashboard. Botões Virar Lead, Enviar, Gerar PDF
- **ProspeccaoDiagnosticoPrint.tsx** — PDF (`/diagnostico/:id/print`). 8 páginas A4. Auto-print após 1.5s. Helper `proxyImg()` resolve CORS de imagens IG
- **ProspeccaoConfiguracoes.tsx** — Edita prompts da IA pela UI (4 prompts: intent, contexto, IG, RA)

### `components/`
- **BuscaForm.tsx** — Input com auto-detect IG/site/busca, intent preview, fontes selecionáveis
- **LeadDescobertoCard.tsx** — Card de lead na Tela 2 (com badge "Analisado" + score quando já tem diagnóstico)
- **SelectionBar.tsx** — Barra flutuante "N selecionados / Analisar" — usa `useSidebar()` pra centralizar respeitando sidebar
- **VirarLeadModal.tsx** — shadcn Dialog. Pipeline + etapa + responsável + produto + tag + telefone. Aceita `phone_override`
- **EnviarDiagnosticoModal.tsx** — shadcn Dialog. 3 canais (WhatsApp / IG / Email). IG e Email são mock
- **ScoreGeralCard.tsx** / **CanalScoreRow.tsx** / **OportunidadeCard.tsx** — exibem partes do diagnóstico
- **AnaliseLoadingOverlay.tsx** — overlay com fontes consultadas em tempo real
- **InstagramBlockRich.tsx** — bloco rico do IG (avatar, KPIs, posts, hashtags, AI insights). Usado no Diagnostico (e PDF reusa via JSX inline)
- **SankeyJornada.tsx** — diagrama Sankey (mapa da jornada do lead)

### `hooks/useProspeccao.ts`
TanStack Query hooks: `useDetectarIntent`, `useBuscar`, `useDiagnostico`, `useAnalisar`, `useVirarLead`, `useDescartarLeads`, `useDiagnosticosDaBusca`, `useDiagnosticosExistentes`, `useDiagnosticosPorBusca`, `usePromptsConfig`, `useUpdatePromptConfig`, `useDirectLead`, `useLeadDescoberto`, `useTemplatesNicho`, `useBuscasRecentes`.

### `lib/`
- **api.ts** — wrappers do supabase client + invocações de edge functions
- **fontes.ts** — catálogo de 18 fontes com label, emoji, custo, agrupamento por pilar

### `types.ts`
Types compartilhados: `Diagnostico`, `LeadDescoberto`, `BuscarOutput`, `AnalisarInput`, `Intent`, `AchadosCanal`, `TemplateNicho`, `PromptConfig`, etc.

---

## Tabelas externas (do CRM hospedeiro) que o módulo usa

**ATENÇÃO:** estas tabelas NÃO são criadas pelo schema do módulo — são do CRM. Se o nome for diferente, ajuste em:
- `components/VirarLeadModal.tsx` (linhas ~52-56) — busca pipelines, stages, team_members, products
- `edge-functions/prospeccao-virar-lead/index.ts` — insert em `leads` e `deals`

| Default | Pode ser | Onde |
|---|---|---|
| `leads` | `contacts`, `clientes` | front + edge fn |
| `deals` | `oportunidades`, `opportunities` | front + edge fn |
| `team_members` | `users`, `vendedores` | front |
| `products` | `produtos` | front |
| `sales_pipelines` | `pipelines`, `funnels` | front |
| `sales_pipeline_stages` | `stages`, `etapas` | front |

---

## Regras invioláveis

1. **Sem FK rígido** entre `prospeccao_*` e tabelas do CRM. Pra remover: `DROP TABLE prospeccao_*` + apagar 6 edge functions + apagar `src/modules/prospeccao/`. Nada mais.

2. **Edge functions são `verify_jwt: false`.** Auth real vem do session cookie do Supabase (passado automaticamente pelo client).

3. **Secrets só em edge functions.** Nunca em `.env` do front. Nunca hardcoded.

4. **Imagens IG via proxy.** Use `proxyImg()` em `ProspeccaoDiagnosticoPrint.tsx` ou aplique manualmente: `https://images.weserv.nl/?url=${encoded}`. CDN do IG bloqueia hotlinking.

5. **Prompts da IA têm schema explícito.** Se mudar campos do output da IA (`fontes/instagram.ts` ou `compiler.ts`), atualize o `prompt_text` no banco PARA TER SCHEMA JSON COMPLETO — senão IA inventa shapes diferentes a cada chamada.

6. **2 mundos:** vendedor explora em `prospeccao_*` SEM mexer no CRM. Só clica "Virar Lead" quando decide. Não criar shortcut que mistura os 2.

7. **`prospeccao-analisar` é stateless.** Pode chamar de novo no mesmo lead — cria novo `diagnosticos` (não atualiza). Histórico preservado.

---

## Como adicionar uma nova fonte de raspagem

Exemplo: adicionar **`google_my_business`**

### 1. Criar arquivo da fonte
`edge-functions/prospeccao-analisar/fontes/google_my_business.ts`
```ts
export interface FonteResult {
  ok: boolean;
  fonte: string;
  custo: number;
  duracao_ms: number;
  achados?: AchadosCanal;
  score?: number;
  erro?: string;
}

export async function analisarGMB(lead, opts): Promise<FonteResult> {
  const t0 = Date.now();
  // ... raspa via API
  return {
    ok: true,
    fonte: "google_my_business",
    custo: 0.05,
    duracao_ms: Date.now() - t0,
    score: 7,
    achados: { metricas: {...}, problemas: [...], atencao: [...], positivos: [...] },
  };
}
```

### 2. Importar e registrar no orquestrador
`edge-functions/prospeccao-analisar/index.ts`:
- Adicionar import
- Adicionar à lista `FONTES_IMPLEMENTADAS`
- Adicionar ao `Promise.allSettled(...)` quando a fonte for selecionada
- Adicionar ao `scoreColMap` e `achadosColMap` se quiser persistir em colunas dedicadas (ou usar `score_outros`/`achados_outros` JSONB)

### 3. Adicionar ao schema
Se quiser coluna dedicada:
```sql
ALTER TABLE prospeccao_diagnosticos ADD COLUMN score_gmb integer;
ALTER TABLE prospeccao_diagnosticos ADD COLUMN achados_gmb jsonb DEFAULT '{}'::jsonb;
```

Ou só salvar em `score_outros->>'gmb'` e `achados_outros->>'gmb'`.

### 4. Frontend
Adicionar ao catálogo `lib/fontes.ts`:
```ts
{ key: "google_my_business", label: "Google My Business", emoji: "📍", custo: 0.05, pilar: "atracao" }
```

Pronto — usuário já vê opção na Tela 1 e na config de templates.

---

## Padrões de código

- **TanStack Query SEMPRE** pra fetch. Nunca `useEffect + fetch`. Cache + invalidation grátis.
- **Edge function retorna shape unificado** (`FonteResult`). Compiler agrega.
- **Toast pra feedback do usuário** via `sonner`. Erros de rede toast vermelho, sucesso toast verde.
- **`startTransition` pra navegações** evita "component suspended while rendering" do React 19.
- **Modais usam shadcn `Dialog`**, não `motion.div` posicionado manualmente. Centralização vertical/horizontal grátis.
- **Filtros e ordenação** sempre client-side (já temos os dados). Server retorna tudo.
- **Loading states** explícitos (skeletons, overlays). Nunca espera silenciosa.

---

## Pitfalls que a gente já caiu

| Erro | Causa | Fix |
|---|---|---|
| "Pipeline" vazio no modal Virar Lead | tabela tem nome diferente (`pipelines` vs `sales_pipelines`) | Ler tabela certa em `VirarLeadModal.tsx` |
| Imagens IG quebradas no PDF | CORS do CDN do Instagram | Usar `proxyImg()` (weserv.nl) |
| `motion.div` com `-translate-x-1/2` no className perde transform | Framer Motion sobrescreve `transform` inline ao animar `y`/`opacity` | Wrapper externo com translate, motion.div interno só anima |
| Análise IG com schema vazio (página 5.5 do PDF) | Prompt sem schema JSON explícito → IA inventa shapes diferentes | Prompt deve listar campos exatos com tipos (já corrigido v2) |
| "Component suspended while responding to synchronous input" | navigate em handler síncrono com lazy route | `startTransition(() => navigate(...))` |
| Cross-discovery achando "qualquer pessoa do mundo" com nome igual | Google Search com handle só retorna homonímia | Só fazer cross-discovery se tem nome+cidade real |
| Reclame Aqui retornando 25k reclamações erradas | Slug fuzzy match | `validateSlugMatch()` valida que slug contém tokens do nome do lead |

---

## Decisões de produto

- **PDF é HTML+CSS print, não puppeteer.** Vantagens: zero infra, custo zero, qualidade premium. Desvantagem: usuário precisa fazer Cmd/Ctrl+P (auto-dispara após 1.5s).
- **DM IG e Email são mock no v2.** Quando houver demanda, virar real (IG via uChat ou Meta API; Email via Resend/Postmark/SendGrid).
- **LinkedIn não tem descoberta em massa.** API pública não existe. Lookup individual funciona via modo direto (cola URL).
- **Custo controlado:** análise completa custa ~R$1/lead. Tabela `prospeccao_uso_api` registra cada chamada externa pra controle de BurnRate.

---

## Antes de mexer em qualquer coisa

1. Ler este arquivo (você acabou de ler ✓)
2. Conferir a tabela do CRM real do mentorado: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
3. Conferir os campos: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='leads'`
4. Se vai mexer em prompt da IA, sempre incluir schema JSON explícito no `prompt_text`
5. Se vai adicionar fonte, seguir o roteiro acima (4 passos)
6. TS check antes de commit: `npx tsc --noEmit`

Boa sorte. 🎯
