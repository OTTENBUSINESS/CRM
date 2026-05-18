import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface WavoipCallEvent {
  type: 'CALL';
  action: 'CREATE' | 'UPDATE';
  whatsapp_call_id: number;
  id_session: number;
  caller: string;
  receiver: string;
  status: 'NONE' | 'INCOMING_RING' | 'OUTGOING_RING' | 'OUTGOING_CALLING' | 'CONNECTING' |
          'CONNECTION_LOST' | 'ACTIVE' | 'HANDLED_REMOTELY' | 'ENDED' | 'REJECTED' |
          'REMOTE_CALL_IN_PROGRESS' | 'FAILED' | 'NOT_ANSWERED';
  call_type?: 'HUMANIZED' | 'ROBOTIC';
  direction: 'INCOMING' | 'OUTCOMING';
  duration?: number;
  record_status?: 'READY' | 'RECORDING' | 'MIXING' | 'DISABLED' | 'EMPTY_RECORDING';
}

interface WavoipRecordEvent {
  type: 'RECORD';
  action: 'UPDATE';
  whatsapp_call_id: number;
  id_session: number;
  record_status: 'READY' | 'RECORDING' | 'MIXING' | 'DISABLED' | 'EMPTY_RECORDING';
  record_url?: string;
}

interface WavoipDeviceEvent {
  type: 'DEVICE';
  action: 'UPDATE';
  id_session: number;
  phone: string;
  status: 'BUILDING' | 'open' | 'close' | 'connecting' | 'no_status' | 'error' |
          'restarting' | 'hibernating' | 'WAITING_PAYMENT';
}

type WavoipEvent = WavoipCallEvent | WavoipRecordEvent | WavoipDeviceEvent;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pegar token do header ou query param para identificar o device
    const url = new URL(req.url);
    const deviceToken = url.searchParams.get('token') || req.headers.get('x-wavoip-token');

    const event: WavoipEvent = await req.json();

    console.log('[WaVoIP Webhook] Received event:', JSON.stringify(event, null, 2));
    console.log('[WaVoIP Webhook] Device token:', deviceToken);

    // Buscar device pelo token ou session_id
    let device = null;
    if (deviceToken) {
      const { data } = await supabase
        .from('wavoip_devices')
        .select('*')
        .eq('token', deviceToken)
        .single();
      device = data;
    }

    switch (event.type) {
      case 'CALL':
        await handleCallEvent(supabase, event, device);
        break;

      case 'RECORD':
        await handleRecordEvent(supabase, event);
        break;

      case 'DEVICE':
        await handleDeviceEvent(supabase, event, deviceToken);
        break;

      default:
        console.log('[WaVoIP Webhook] Unknown event type:', (event as any).type);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[WaVoIP Webhook] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleCallEvent(supabase: any, event: WavoipCallEvent, device: any) {
  const callId = String(event.whatsapp_call_id);
  const sessionId = String(event.id_session);

  // Normalizar direction (OUTCOMING → OUTGOING)
  const direction = event.direction === 'OUTCOMING' ? 'OUTGOING' : event.direction;

  // Determinar peer phone baseado na direção
  const peerPhone = direction === 'OUTGOING' ? event.receiver : event.caller;

  // Buscar lead pelo telefone
  const { data: leadData } = await supabase.rpc('find_lead_by_phone', { p_phone: peerPhone });
  const leadId = leadData || null;

  if (event.action === 'CREATE') {
    // Nova chamada
    const callData = {
      wavoip_device_id: device?.id || null,
      wavoip_call_id: callId,
      wavoip_session_id: sessionId,
      team_member_id: device?.team_member_id || null,
      lead_id: leadId,
      call_type: 'whatsapp',
      direction: direction,
      status: event.status,
      caller_phone: event.caller,
      receiver_phone: event.receiver,
      peer_phone: peerPhone,
      duration_seconds: event.duration || 0,
      record_status: event.record_status || null,
      started_at: new Date().toISOString(),
      metadata: {
        call_type: event.call_type,
        raw_event: event,
      },
    };

    const { data, error } = await supabase
      .from('call_history')
      .insert(callData)
      .select()
      .single();

    if (error) {
      console.error('[WaVoIP Webhook] Error creating call:', error);
    } else {
      console.log('[WaVoIP Webhook] Call created:', data.id);

      // Enviar evento realtime para o frontend
      await supabase
        .from('call_history')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', data.id);
    }
  } else if (event.action === 'UPDATE') {
    // Atualizar chamada existente
    const updateData: any = {
      status: event.status,
    };

    if (event.duration !== undefined) {
      updateData.duration_seconds = event.duration;
    }

    if (event.record_status) {
      updateData.record_status = event.record_status;
    }

    // Se a chamada terminou, setar ended_at
    const endedStatuses = ['ENDED', 'REJECTED', 'FAILED', 'NOT_ANSWERED', 'HANDLED_REMOTELY'];
    if (endedStatuses.includes(event.status)) {
      updateData.ended_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('call_history')
      .update(updateData)
      .eq('wavoip_call_id', callId)
      .select()
      .single();

    if (error) {
      console.error('[WaVoIP Webhook] Error updating call:', error);
    } else {
      console.log('[WaVoIP Webhook] Call updated:', data?.id, '- Status:', event.status);
    }
  }
}

async function handleRecordEvent(supabase: any, event: WavoipRecordEvent) {
  const callId = String(event.whatsapp_call_id);

  // Buscar estado atual da chamada antes de atualizar
  const { data: existingCall } = await supabase
    .from('call_history')
    .select('record_url, record_status, metadata')
    .eq('wavoip_call_id', callId)
    .single();

  // Verificar se o browser já fez upload de gravação para o Supabase Storage
  const browserAlreadyUploaded = existingCall?.record_status === 'completed' &&
    existingCall?.record_url?.includes('supabase');

  const wavoipRecordUrl = event.record_url ||
    (event.record_status === 'READY' ? `https://storage.wavoip.com/${event.whatsapp_call_id}` : null);

  const updateData: any = {
    record_status: event.record_status,
  };

  if (browserAlreadyUploaded) {
    // Browser já gravou e fez upload → preservar URL do Supabase, guardar WaVoIP como fallback
    console.log('[WaVoIP Webhook] Browser recording exists, preserving Supabase URL. Saving WaVoIP URL in metadata.');
    if (wavoipRecordUrl) {
      updateData.metadata = {
        ...(existingCall?.metadata || {}),
        wavoip_record_url: wavoipRecordUrl,
      };
    }
    // NÃO sobrescrever record_url nem record_status
    delete updateData.record_status;
  } else {
    // Sem gravação do browser → usar URL WaVoIP normalmente
    if (wavoipRecordUrl) {
      updateData.record_url = wavoipRecordUrl;
    }
  }

  const { data, error } = await supabase
    .from('call_history')
    .update(updateData)
    .eq('wavoip_call_id', callId)
    .select()
    .single();

  if (error) {
    console.error('[WaVoIP Webhook] Error updating record:', error);
  } else {
    console.log('[WaVoIP Webhook] Record updated:', data?.id, '- Status:', event.record_status);

    // Se gravação está pronta, disparar processamento com IA
    if (event.record_status === 'READY' && data) {
      console.log('[WaVoIP Webhook] Triggering AI processing for call:', data.id);

      // Chamar edge function de processamento de forma assíncrona
      const processUrl = `${SUPABASE_URL}/functions/v1/process-call-recording`;
      fetch(processUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ call_id: data.id }),
      }).catch(err => {
        console.error('[WaVoIP Webhook] Error triggering AI processing:', err);
      });
    }
  }
}

async function handleDeviceEvent(supabase: any, event: WavoipDeviceEvent, deviceToken: string | null) {
  if (!deviceToken) {
    console.log('[WaVoIP Webhook] No device token for DEVICE event');
    return;
  }

  // Mapear status do WaVoIP para nosso formato
  const statusMap: Record<string, string> = {
    'open': 'connected',
    'close': 'disconnected',
    'connecting': 'connecting',
    'hibernating': 'hibernating',
    'restarting': 'restarting',
    'error': 'error',
    'BUILDING': 'building',
    'WAITING_PAYMENT': 'payment_required',
    'no_status': 'unknown',
  };

  const mappedStatus = statusMap[event.status] || event.status;

  const updateData: any = {
    status: mappedStatus,
  };

  if (event.phone) {
    updateData.phone_number = event.phone;
  }

  const { data, error } = await supabase
    .from('wavoip_devices')
    .update(updateData)
    .eq('token', deviceToken)
    .select()
    .single();

  if (error) {
    console.error('[WaVoIP Webhook] Error updating device:', error);
  } else {
    console.log('[WaVoIP Webhook] Device updated:', data?.id, '- Status:', mappedStatus);
  }
}
