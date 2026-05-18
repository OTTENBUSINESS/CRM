import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Lidas da tabela `config` via loadConfig() no handler — nada hardcoded.
let UAZAPI_URL = ''
let UAZAPI_TOKEN = ''
let PAIN_GROUP_JID = ''

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

async function loadConfig() {
  const { data } = await supabase
    .from('config')
    .select('key, value')
    .in('key', ['UAZAPI_ADMIN_URL', 'UAZAPI_ADMIN_TOKEN', 'PAIN_GROUP_JID'])
  const map = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]))
  UAZAPI_URL = map['UAZAPI_ADMIN_URL'] || ''
  UAZAPI_TOKEN = map['UAZAPI_ADMIN_TOKEN'] || ''
  PAIN_GROUP_JID = map['PAIN_GROUP_JID'] || ''
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

// Verificar se está no grupo
async function checkIfInGroup(formattedNumber: string): Promise<boolean> {
  try {
    const response = await fetch(`${UAZAPI_URL}/chat/details`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number: formattedNumber,
        preview: false,
      }),
    })
    const result = await response.json()
    return result.wa_common_groups?.includes(PAIN_GROUP_JID) || 
           result.wa_common_groups?.includes('PAIN') || false
  } catch {
    return false
  }
}

// Executar ação no grupo (add, remove, promote, demote)
async function executeGroupAction(action: string, participants: string[]): Promise<any> {
  const response = await fetch(`${UAZAPI_URL}/group/updateParticipants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': UAZAPI_TOKEN,
    },
    body: JSON.stringify({
      groupjid: PAIN_GROUP_JID,
      action,
      participants,
    }),
  })
  return response.json()
}

// Enviar mensagem de texto
async function sendTextMessage(number: string, text: string): Promise<void> {
  await fetch(`${UAZAPI_URL}/send/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': UAZAPI_TOKEN,
    },
    body: JSON.stringify({ number, text }),
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  await loadConfig()
  if (!UAZAPI_URL || !UAZAPI_TOKEN) {
    return new Response(JSON.stringify({
      success: false,
      error: 'UAZAPI nao configurada. Preencha UAZAPI_ADMIN_URL e UAZAPI_ADMIN_TOKEN em /configuracoes > API Keys.'
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const { phone, memberName, memberId, action = 'add' } = await req.json()

    if (!phone) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Telefone é obrigatório'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const formattedNumber = formatPhone(phone)
    console.log(`[${action.toUpperCase()}] ${memberName} (${formattedNumber})`)

    // ========================================
    // AÇÃO: REMOVE - Remover do grupo
    // ========================================
    if (action === 'remove') {
      const isInGroup = await checkIfInGroup(formattedNumber)
      
      if (!isInGroup) {
        // Atualizar banco
        if (memberId) {
          await supabase
            .from('organization_members')
            .update({ whatsapp_in_group: false })
            .eq('id', memberId)
        }

        return new Response(JSON.stringify({
          success: true,
          already_removed: true,
          message: `${memberName} não estava no grupo`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Remover do grupo
      const result = await executeGroupAction('remove', [formattedNumber])
      console.log('Resultado remove:', JSON.stringify(result.groupUpdated))

      const participantResult = result.groupUpdated?.[0]
      
      if (participantResult?.Error === 0 || !participantResult?.Error) {
        // Atualizar banco
        if (memberId) {
          await supabase
            .from('organization_members')
            .update({ 
              whatsapp_in_group: false,
              whatsapp_removed_at: new Date().toISOString()
            })
            .eq('id', memberId)
        }

        return new Response(JSON.stringify({
          success: true,
          removed: true,
          message: `${memberName} foi removido do grupo`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        success: false,
        error: `Erro ao remover: ${participantResult?.Error || 'desconhecido'}`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================
    // AÇÃO: PROMOTE - Promover a admin
    // ========================================
    if (action === 'promote') {
      const result = await executeGroupAction('promote', [formattedNumber])
      console.log('Resultado promote:', JSON.stringify(result.groupUpdated))

      const participantResult = result.groupUpdated?.[0]
      
      if (participantResult?.Error === 0 || !participantResult?.Error) {
        return new Response(JSON.stringify({
          success: true,
          promoted: true,
          message: `${memberName} foi promovido a administrador`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        success: false,
        error: `Erro ao promover: ${participantResult?.Error || 'desconhecido'}`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================
    // AÇÃO: DEMOTE - Remover admin
    // ========================================
    if (action === 'demote') {
      const result = await executeGroupAction('demote', [formattedNumber])
      console.log('Resultado demote:', JSON.stringify(result.groupUpdated))

      const participantResult = result.groupUpdated?.[0]
      
      if (participantResult?.Error === 0 || !participantResult?.Error) {
        return new Response(JSON.stringify({
          success: true,
          demoted: true,
          message: `${memberName} não é mais administrador`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        success: false,
        error: `Erro ao rebaixar: ${participantResult?.Error || 'desconhecido'}`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================
    // AÇÃO: CHECK - Apenas verificar status
    // ========================================
    if (action === 'check') {
      const isInGroup = await checkIfInGroup(formattedNumber)
      
      // Atualizar banco
      if (memberId) {
        await supabase
          .from('organization_members')
          .update({ whatsapp_in_group: isInGroup })
          .eq('id', memberId)
      }

      return new Response(JSON.stringify({
        success: true,
        in_group: isInGroup,
        message: isInGroup ? `${memberName} está no grupo` : `${memberName} não está no grupo`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================
    // AÇÃO: ADD - Adicionar ao grupo (default)
    // ========================================
    
    // Verificar se já está no grupo
    const isInGroup = await checkIfInGroup(formattedNumber)

    if (isInGroup) {
      // Atualizar banco
      if (memberId) {
        await supabase
          .from('organization_members')
          .update({ whatsapp_in_group: true })
          .eq('id', memberId)
      }

      return new Response(JSON.stringify({
        success: true,
        already_in_group: true,
        message: `${memberName} já está no grupo`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Adicionar ao grupo
    const addResult = await executeGroupAction('add', [formattedNumber])
    console.log('Resultado add:', JSON.stringify(addResult.groupUpdated))

    const participantResult = addResult.groupUpdated?.[0]

    // Error 403 = precisa aceitar convite - enviar mensagem com link
    if (participantResult?.Error === 403 && participantResult?.AddRequest) {
      const inviteCode = participantResult.AddRequest.Code
      const inviteExpires = new Date(participantResult.AddRequest.Expiration).toLocaleDateString('pt-BR')
      const firstName = memberName?.split(' ')[0] || 'Olá'

      // Enviar mensagem com o link de convite
      const inviteMessage = `Olá ${firstName}! 👋

Você foi convidado para o grupo exclusivo do PAIN no WhatsApp.

Clique no link abaixo para entrar:
https://chat.whatsapp.com/${inviteCode}

Esse convite expira em ${inviteExpires}.`

      await sendTextMessage(formattedNumber, inviteMessage)
      console.log(`Convite enviado para ${memberName}: https://chat.whatsapp.com/${inviteCode}`)

      return new Response(JSON.stringify({
        success: true,
        invite_sent: true,
        invite_code: inviteCode,
        invite_expires: participantResult.AddRequest.Expiration,
        message: `Convite enviado para ${memberName} via WhatsApp. Expira em ${inviteExpires}.`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Error 0 = adicionado com sucesso
    if (participantResult?.Error === 0) {
      // Atualizar banco
      if (memberId) {
        await supabase
          .from('organization_members')
          .update({ 
            whatsapp_in_group: true,
            whatsapp_added_at: new Date().toISOString()
          })
          .eq('id', memberId)
      }

      return new Response(JSON.stringify({
        success: true,
        added: true,
        message: `${memberName} foi adicionado ao grupo!`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Outro erro
    return new Response(JSON.stringify({
      success: false,
      error: `Erro ${participantResult?.Error || 'desconhecido'} ao adicionar ao grupo`
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Erro:', error)
    return new Response(JSON.stringify({
      success: false,
      error: String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
