# 🚀 CRM AI-First — Guia de Boas-Vindas

Bem-vindo(a)! Este é o CRM comercial com IA que você recebeu do programa
**IA na Prática**. Antes de abrir o Claude Code e mandar ele configurar tudo
pra você, **siga os 5 passos abaixo**. É rápido e evita dor de cabeça.

---

## ✅ Passo 1 — Instalar pré-requisitos no seu computador

Abra o **Terminal** (Mac) ou **PowerShell** (Windows) e rode:

```bash
node -v
```

Precisa aparecer `v18` ou maior. Se não tiver, baixe em https://nodejs.org

Depois instale a CLI do Supabase:

**Mac:**
```bash
brew install supabase/tap/supabase
```

**Windows:**
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

Confirme:
```bash
supabase --version
```

---

## ✅ Passo 2 — Criar conta e projeto no Supabase

O Supabase é onde fica o **banco de dados** do seu CRM. É grátis pra começar.

1. Acesse https://supabase.com/dashboard e crie sua conta
2. Clique em **"New project"**
3. Preencha:
   - **Name:** `crm-aifirst-meu-negocio`
   - **Database Password:** crie uma senha forte e **anote em local seguro**
   - **Region:** `South America (São Paulo)` ⚠️ importante, não mude
4. Clique **Create new project** e aguarde ~2 minutos
5. Depois de criado, guarde a URL do projeto — algo como
   `https://SEU_REF.supabase.co` (o `SEU_REF` é a parte que muda)

---

## ✅ Passo 3 — Pegar suas API Keys das IAs

Você vai precisar de **no mínimo 2 chaves** pra IA funcionar:

### Obrigatórias

| Serviço | Pra que serve | Onde pegar |
|---------|---------------|------------|
| **Anthropic Claude** | Cérebro do agente IA, scoring, briefings | https://console.anthropic.com/settings/keys |
| **Google Gemini** | Transcrição de áudio + leitura de imagens no WhatsApp | https://aistudio.google.com/app/apikey |

### WhatsApp (escolha uma)

| Serviço | Quando usar | Onde pegar |
|---------|-------------|------------|
| **UAZAPI** | Mais fácil — usa QR Code do seu celular | https://uazapi.com |
| **WhatsApp Cloud (Meta)** | API oficial, precisa aprovação do Facebook | https://developers.facebook.com/docs/whatsapp |

**Recomendo UAZAPI pra começar** — só precisa contratar o serviço deles e
eles te dão a URL e o token admin.

### Opcionais (só se for usar o módulo)
- **OpenAI** (Whisper — alternativa Gemini pra áudio): https://platform.openai.com/api-keys
- **Soniox** (telefonia VoIP transcrita): https://soniox.com
- **Google Cloud** (Calendar): https://console.cloud.google.com/apis/credentials
- **Asaas** (pagamentos): https://asaas.com
- **Resend** (emails): https://resend.com

💡 **Dica:** salve todas as chaves num bloco de notas. Você vai colar elas na
tela de configurações depois.

---

## ✅ Passo 4 — Descompactar o projeto e abrir no Claude Code

1. Descompacte o arquivo `crm-template.zip` numa pasta do seu computador
2. Abra o **Terminal** e entre na pasta:
   ```bash
   cd caminho/para/crm-template
   ```
3. Conecte o MCP do Supabase ao Claude Code (**faça isso só 1 vez**):
   ```bash
   claude mcp add --transport http supabase https://mcp.supabase.com/mcp
   ```
4. Faça login na CLI do Supabase:
   ```bash
   supabase login
   ```
   Vai abrir o navegador → autorize com a mesma conta que criou o projeto.
5. Agora abra o Claude Code na pasta:
   ```bash
   claude
   ```

---

## ✅ Passo 5 — Deixar o Claude configurar tudo

Quando o Claude Code abrir, **digite qualquer coisa** — pode ser só "oi".

Ele vai detectar que é a primeira vez e vai assumir o comando, te guiando
passo a passo. Vai pedir:

- O **project ref** do seu Supabase (você anotou no Passo 2)
- Suas **API keys** (você separou no Passo 3)
- Pra você **escanear um QR Code** pro WhatsApp conectar

⏱️ **Tempo total:** uns 20-30 minutos sendo bem tranquilo.

---

## 🩺 Validar se deu tudo certo

Ao final, rode o script de validação:

```bash
bash scripts/health-check.sh
```

Se der **✅ todos os checks**, seu CRM está pronto! Acesse:

```bash
npm run dev
```

E abra http://localhost:8080 no navegador.

---

## 🤖 Criar seu Agente IA de Vendas

Depois que o CRM estiver rodando, digite no Claude Code:

```
/criar-agente-ia
```

Ele vai te entrevistar sobre o seu negócio e configurar o agente vendedor
que responde leads no WhatsApp 24h por dia.

---

## ❓ Deu ruim?

- **Claude travou no meio?** Pede pra ele: `continue de onde parou`
- **Erro estranho?** Roda `bash scripts/health-check.sh` e mostra o resultado
  pro Claude — ele identifica onde parou
- **Mensagem não chega no agente?** Verifica se cadastrou `ANTHROPIC_API_KEY`
  e `GEMINI_API_KEY` em Configurações → Integrações
- **Dúvidas gerais?** Grupo do programa IA na Prática

---

## ⚠️ Importante sobre segurança

- **NUNCA** compartilhe o arquivo `.env` — ele tem a chave do seu banco
- **NUNCA** suba esse projeto pro GitHub público sem revisar
- As API keys ficam **criptografadas no banco** (não no código) — é seguro
- Só **você e seu time** têm acesso ao seu CRM (isolamento por tenant)

---

Bora vender com IA! 🚀

— Frank Costa | IA na Prática
