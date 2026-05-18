#!/usr/bin/env bash
# =============================================================================
# HEALTH CHECK — CRM AI-First
# =============================================================================
# Roda DEPOIS do /setup-projeto pra validar que tudo ta funcionando.
# Uso: bash scripts/health-check.sh
#
# Checks divididos em:
#   1-3: Pre-requisitos locais (node, npm, supabase CLI, arquivos, .env)
#   4:   Conectividade com Supabase (usa anon key)
#   5:   Edge functions deployadas (OPTIONS preflight)
#   6:   Instrucoes pra validacao manual das API keys (precisa service role)
# =============================================================================

set -u

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

ok() { echo -e "${GREEN}✅${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}❌${NC} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "${YELLOW}⚠️${NC}  $1"; WARN=$((WARN+1)); }
info() { echo -e "${BLUE}ℹ️${NC}  $1"; }
section() { echo ""; echo -e "${BLUE}━━━ $1 ━━━${NC}"; }

cd "$(dirname "$0")/.." || exit 1

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════╗"
echo "║   CRM AI-First — Health Check                      ║"
echo "╚════════════════════════════════════════════════════╝"
echo -e "${NC}"

# =============================================================================
section "1. Pre-requisitos locais"
# =============================================================================

if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -ge 18 ]; then
    ok "Node $(node -v)"
  else
    fail "Node $(node -v) — precisa >= 18"
  fi
else
  fail "Node nao instalado — https://nodejs.org"
fi

command -v npm >/dev/null 2>&1 && ok "npm $(npm -v)" || fail "npm nao instalado"

if command -v supabase >/dev/null 2>&1; then
  ok "Supabase CLI $(supabase --version 2>&1 | head -1)"
else
  fail "Supabase CLI nao instalado — brew install supabase/tap/supabase"
fi

# =============================================================================
section "2. Arquivos do projeto"
# =============================================================================

[ -f package.json ] && ok "package.json presente" || fail "package.json ausente"
[ -d node_modules ] && ok "node_modules instalado" || warn "node_modules ausente — rode: npm install"
[ -f .env ] && ok ".env presente" || fail ".env ausente — copie de .env.example e preencha"
[ -d supabase/migrations ] && ok "supabase/migrations presente" || fail "migrations ausentes"
[ -d supabase/functions ] && ok "supabase/functions presente" || fail "edge functions ausentes"

# =============================================================================
section "3. Variaveis .env"
# =============================================================================

if [ -f .env ]; then
  SUPA_URL=$(grep "^VITE_SUPABASE_URL=" .env | cut -d= -f2- | tr -d '"')
  SUPA_KEY=$(grep "^VITE_SUPABASE_ANON_KEY=" .env | cut -d= -f2- | tr -d '"')

  if [ -n "$SUPA_URL" ] && [[ "$SUPA_URL" == https://*.supabase.co ]]; then
    ok "VITE_SUPABASE_URL preenchida ($(echo $SUPA_URL | sed 's|https://||' | cut -d. -f1))"
  else
    fail "VITE_SUPABASE_URL vazia ou invalida"
  fi

  if [ -n "$SUPA_KEY" ] && [[ "$SUPA_KEY" == eyJ* ]]; then
    ok "VITE_SUPABASE_ANON_KEY preenchida"
  else
    fail "VITE_SUPABASE_ANON_KEY vazia ou invalida (deve comecar com 'eyJ')"
  fi
else
  SUPA_URL=""
  SUPA_KEY=""
fi

# =============================================================================
section "4. Conectividade com Supabase"
# =============================================================================

if [ -n "$SUPA_URL" ] && [ -n "$SUPA_KEY" ]; then
  # Testa auth endpoint (sempre publico, nao exige RLS)
  AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $SUPA_KEY" \
    "$SUPA_URL/auth/v1/settings" 2>/dev/null)

  if [ "$AUTH_STATUS" = "200" ]; then
    ok "Supabase Auth responde"
  else
    fail "Supabase Auth nao responde (HTTP $AUTH_STATUS) — URL/key invalidos?"
  fi

  # Testa tabela publica tenants via REST (se existir, migrations rodaram)
  TABLE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $SUPA_KEY" \
    -H "Authorization: Bearer $SUPA_KEY" \
    "$SUPA_URL/rest/v1/config?select=key&limit=1" 2>/dev/null)

  if [ "$TABLE_CHECK" = "200" ]; then
    ok "Migrations aplicadas (tabela 'config' acessivel)"
  elif [ "$TABLE_CHECK" = "404" ] || [ "$TABLE_CHECK" = "400" ]; then
    fail "Tabela 'config' nao existe — migrations nao rodaram (HTTP $TABLE_CHECK)"
  else
    warn "Tabela 'config' retornou HTTP $TABLE_CHECK — RLS bloqueando? Valide no Dashboard"
  fi
else
  warn "Pulando checks de Supabase (faltam credenciais no .env)"
fi

# =============================================================================
section "5. Edge Functions deployadas"
# =============================================================================

if [ -n "$SUPA_URL" ] && [ -n "$SUPA_KEY" ]; then
  # Funcoes criticas — se alguma nao estiver deployada, o sistema nao funciona
  CRITICAL_FUNCS=(
    "ai-sales-agent"
    "whatsapp-webhook"
    "whatsapp-cloud-webhook"
    "coach-suggestion"
    "send-whatsapp-cloud"
    "soniox-token"
    "wavoip-webhook"
  )

  for fn in "${CRITICAL_FUNCS[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X OPTIONS \
      -H "apikey: $SUPA_KEY" \
      "$SUPA_URL/functions/v1/$fn" 2>/dev/null)

    if [ "$STATUS" = "200" ] || [ "$STATUS" = "204" ]; then
      ok "$fn"
    else
      fail "$fn NAO deployada (HTTP $STATUS)"
    fi
  done

  info "52 funcoes no total. Lista completa: ls supabase/functions"
else
  warn "Pulando checks de edge functions (faltam credenciais)"
fi

# =============================================================================
section "6. API Keys (validacao manual)"
# =============================================================================

info "Nao consigo validar API keys via shell (precisa service role key)."
info "Abra o CRM e verifique em: /configuracoes > Integracoes"
echo ""
echo "   OBRIGATORIAS (sem elas nada funciona):"
echo "   • ANTHROPIC_API_KEY    — Agente IA, coach, bot tarefas"
echo "   • GEMINI_API_KEY       — Transcricao de audio + descricao imagem"
echo "   • UAZAPI_ADMIN_URL     — URL do seu servidor UAZAPI"
echo "   • UAZAPI_ADMIN_TOKEN   — Admin token da UAZAPI"
echo ""
echo "   OPCIONAIS (so se usar o modulo):"
echo "   • OPENAI_API_KEY              — Whisper (alternativa Gemini)"
echo "   • SONIOX_API_KEY              — Telefonia VoIP"
echo "   • WHATSAPP_CLOUD_TOKEN        — WhatsApp Cloud API oficial"
echo "   • WHATSAPP_PHONE_NUMBER_ID    — Par com o token acima"
echo "   • GOOGLE_CLIENT_ID + SECRET   — Google Calendar"
echo "   • ASAAS_API_KEY               — Gateway pagamento"
echo "   • RESEND_API_KEY              — Email transacional"

# =============================================================================
section "7. Validacao manual final"
# =============================================================================

info "Apos tudo acima PASSAR, faca este teste end-to-end:"
echo ""
echo "   1. npm run dev                           → abre em http://localhost:8080"
echo "   2. Cria conta + loga"
echo "   3. /configuracoes > WhatsApp             → cria instancia + escaneia QR"
echo "   4. /configuracoes > Equipe               → vincula seu user na instancia"
echo "   5. Digite no Claude Code: /criar-agente-ia"
echo "   6. Manda msg do seu celular pessoal      → agente deve responder"
echo ""

# =============================================================================
# RESULTADO FINAL
# =============================================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}✅ Passou: $PASS${NC}   ${YELLOW}⚠️  Avisos: $WARN${NC}   ${RED}❌ Falhou: $FAIL${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}🎉 Checks automaticos OK. Faca a validacao manual acima.${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}❌ $FAIL problema(s) encontrado(s). Corrija antes de usar.${NC}"
  echo ""
  echo "   Se precisar de ajuda: abra Claude Code e digite /setup-projeto"
  echo "   Ele identifica onde parou e continua do ponto correto."
  echo ""
  exit 1
fi
