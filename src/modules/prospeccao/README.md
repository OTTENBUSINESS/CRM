# Módulo Prospecção Diagnóstico

> Funcionalidade de descoberta + análise multi-canal de leads. Vendedor digita
> "clínicas de estética em São Paulo" e recebe lista de leads + diagnóstico.

---

## 🧱 Princípios

1. **Módulo isolado** — toda lógica em `src/modules/prospeccao/` + `supabase/functions/prospeccao-*` + 1 migration. Pra remover, basta deletar essas 3 coisas.
2. **Sem FK rígido** com `leads`, `team_members` ou `sales_deals`. Replicável em qualquer CRM Supabase.
3. **2 mundos**:
   - **MUNDO DESCOBERTA** (tabelas `prospeccao_*`): vendedor explora, qualifica
   - **MUNDO CRM** (`leads`, `sales_deals`, etc): só quando vendedor clica "Virar lead"

---

## 📦 O que está implementado (v1 — Parte 1)

| Camada | Arquivo | Status |
|---|---|---|
| Schema + RLS + 10 nichos seed | `supabase/migrations/20260427_prospeccao_diagnostico.sql` | ✅ |
| Edge function `detectar-intent` (Gemini Flash) | `supabase/functions/prospeccao-detectar-intent/` | ✅ |
| Edge function `buscar` (Firecrawl Maps) | `supabase/functions/prospeccao-buscar/` | ✅ |
| Tela 1 — busca livre + IA detect + fontes | `pages/ProspeccaoSearch.tsx` | ✅ |
| Tela 3 — lista descobertos + filtros + seleção | `pages/ProspeccaoDescobertos.tsx` | ✅ |
| Rota `/comercial/prospeccao` + sidebar | `src/App.tsx`, `src/components/layout/AppSidebar.tsx` | ✅ |

## 🔜 Próximas partes (não implementado ainda)

- [ ] **Parte 2** — Edge function `prospeccao-analisar` (paralelo: site, IG, FB, Reclame Aqui...)
- [ ] **Parte 3** — Tela 5 — Dashboard do diagnóstico (scores + oportunidades IA)
- [ ] **Parte 4** — Geração de PDF (Modal.com worker)
- [ ] **Parte 5** — Envio DM IG / WhatsApp
- [ ] **Parte 6** — `prospeccao-virar-lead` (cria lead + deal no pipeline escolhido)

---

## 🚀 Deploy (passo-a-passo)

### 1. Aplicar a migration no Supabase
```bash
# via SQL Editor: copia o conteúdo de
# supabase/migrations/20260427_prospeccao_diagnostico.sql
# e roda
```

Confere:
```sql
SELECT count(*) FROM prospeccao_templates_nicho; -- deve ser 10
```

### 2. Configurar secrets das edge functions
```bash
supabase secrets set FIRECRAWL_API_KEY=fc-xxxxx
# GEMINI_API_KEY já existe no projeto (compartilhado com outras functions)
```

### 3. Deploy das edge functions
```bash
supabase functions deploy prospeccao-detectar-intent --no-verify-jwt
supabase functions deploy prospeccao-buscar --no-verify-jwt
```

### 4. Frontend
```bash
npm run dev
# acessa /comercial/prospeccao
```

---

## 🧪 Como testar

1. Login no CRM
2. Sidebar → Comercial → **Prospecção**
3. Digite: `clínicas de estética em São Paulo`
4. Aguarde detecção IA (~1s) → confira nicho/cidade detectados
5. Ajuste fontes se quiser (toggle chips)
6. Clique **Buscar 20 leads**
7. Vai pra `/comercial/prospeccao/busca/:id` → ver cards
8. Selecione 2-3 leads → barra inferior aparece
9. (Fase 2 ainda não — botão "Analisar" mostra alerta placeholder)

---

## 📁 Estrutura do módulo

```
src/modules/prospeccao/
├── README.md                  ← você está aqui
├── index.ts                   ← re-exports públicos
├── types.ts                   ← interfaces TS
├── lib/
│   ├── api.ts                 ← chamadas Supabase + edge functions
│   └── fontes.ts              ← catálogo (label, emoji, custo)
├── hooks/
│   └── useProspeccao.ts       ← TanStack Query hooks
├── pages/
│   ├── ProspeccaoSearch.tsx   ← Tela 1 (busca livre)
│   └── ProspeccaoDescobertos.tsx ← Tela 3 (lista de descobertos)
└── components/
    ├── BuscaForm.tsx          ← input + IntentPreview + FonteToggle
    ├── IntentPreview.tsx      ← badge IA detectou
    ├── FonteToggle.tsx        ← chips de fontes
    ├── LeadDescobertoCard.tsx ← card lead (com DorBadge)
    ├── SelectionBar.tsx       ← rodapé fixo selecionados
    ├── EmptyState.tsx
    └── LoadingSkeleton.tsx
```

---

## 📦 Como exportar pro aluno (futuro)

Pra empacotar como ZIP:
1. Copie a pasta `src/modules/prospeccao/`
2. Copie `supabase/functions/prospeccao-*`
3. Copie `supabase/migrations/20260427_prospeccao_diagnostico.sql`
4. No `src/App.tsx` do aluno, adicione 2 imports + 2 rotas
5. No `AppSidebar.tsx` do aluno, adicione o item "Prospecção"

(Vou empacotar isso depois que validar a parte 2.)

---

## 🔑 APIs externas necessárias

| Provider | Pra quê | Custo aprox |
|---|---|---|
| Firecrawl | Scrape Google Maps, sites, Reclame Aqui, iFood, Doctoralia... | $0.015/scrape |
| Gemini Flash | Detectar intent da query livre + gerar oportunidades | ~$0.001/query |
| ScrapeCreators (opcional, fase 2) | TikTok / LinkedIn / FB nativos | $0.005-0.01/call |
| RapidAPI (já tem) | Instagram (reusa cache existente) | já pago |

---

## 🔐 Segurança / RLS

Todas as 4 tabelas têm RLS:
```sql
FOR ALL TO authenticated USING (true) WITH CHECK (true)
```

Single-tenant — todo team membro vê tudo (igual o resto do CRM CS).
Quando o aluno importar no CRM dele, o RLS funciona igual.
