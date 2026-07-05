import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function formatPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned.startsWith('55') && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

function isUazapiSuccess(resp: Response, result: any): { success: boolean; messageId: string } {
  if (!resp.ok) return { success: false, messageId: '' };
  if (result.messageId) return { success: true, messageId: result.messageId };
  if (result.id && (result.fromMe === true || result.chatid)) {
    return { success: true, messageId: result.id };
  }
  if (result.key?.id) return { success: true, messageId: result.key.id };
  if (result.status === 'PENDING') return { success: true, messageId: '' };
  return { success: false, messageId: '' };
}

// Detecta se o erro indica instância desconectada/indisponível
function isDisconnectedError(resp: Response, result: any, errorMsg: string): boolean {
  // UAZAPI retorna {error: true} com boolean quando instância está desconectada
  if (result.error === true && typeof result.message !== 'string' && !result.messageId) return true;
  // Padrões de texto que indicam desconexão
  const disconnectPatterns = ['disconnect', 'not connected', 'not logged', 'qr code', 'session closed', 'connection lost', 'not ready'];
  const lowerMsg = errorMsg.toLowerCase();
  return disconnectPatterns.some(p => lowerMsg.includes(p));
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: campaigns, error: cErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'sending');

    if (cErr) throw cErr;
    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ processed: 0, reason: 'no_sending_campaigns' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalProcessed = 0;
    const details: any[] = [];

    for (const campaign of campaigns) {
      try {
        const result = await processCampaign(supabase, campaign);
        totalProcessed += result.processed;
        details.push({ campaign_id: campaign.id, name: campaign.name, ...result });
      } catch (err: any) {
        console.error(`[Processor] Error processing campaign ${campaign.id}:`, err);
        details.push({ campaign_id: campaign.id, error: err.message });
      }
    }

    return new Response(JSON.stringify({ processed: totalProcessed, details }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Processor] Fatal error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processCampaign(supabase: any, campaign: any): Promise<{ processed: number; skipped?: number; reason?: string }> {
  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentHour = brTime.getHours();
  const currentMinute = brTime.getMinutes();

  const [startH, startM] = (campaign.business_hours_start || '08:00').split(':').map(Number);
  const [endH, endM] = (campaign.business_hours_end || '20:00').split(':').map(Number);
  const currentTime = currentHour * 60 + currentMinute;
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;

  if (currentTime < startTime || currentTime >= endTime) {
    console.log(`[Processor] Campaign ${campaign.id}: outside business hours (${currentHour}:${String(currentMinute).padStart(2,'0')})`);
    return { processed: 0, reason: 'outside_business_hours' };
  }

  const totalSent = campaign.sent_count || 0;
  const totalBlocked = campaign.blocked_count || 0;
  if (totalSent > 10 && totalBlocked / totalSent > 0.03) {
    await supabase.from('campaigns').update({
      status: 'paused',
      paused_at: new Date().toISOString(),
      pause_reason: `Auto-pausada: taxa de bloqueio ${Math.round(totalBlocked/totalSent*100)}% (>3%)`,
      updated_at: new Date().toISOString(),
    }).eq('id', campaign.id);
    return { processed: 0, reason: 'block_rate_high' };
  }

  const instanceIds = campaign.instance_ids || [];
  if (instanceIds.length === 0) {
    return { processed: 0, reason: 'no_instances' };
  }

  const today = brTime.toISOString().split('T')[0];
  const availableInstances: string[] = [];

  const isCloudApi = (campaign.provider || 'uazapi') === 'cloud_api';

  for (const instId of instanceIds) {
    // Cloud API (Meta) NÃO precisa de warmup, hourly/daily limit manual nem detecção
    // de block — a Meta gerencia rate-limiting e qualidade da conta. Pula direto.
    if (isCloudApi) {
      availableInstances.push(instId);
      continue;
    }

    const { data: stats } = await supabase
      .from('campaign_instance_stats')
      .select('*')
      .eq('instance_id', instId)
      .eq('date', today)
      .maybeSingle();

    const hourlyLimit = campaign.hourly_limit_per_instance || 40;
    const dailyLimit = campaign.daily_limit_per_instance || 500;

    if (stats) {
      if (stats.cooldown_until && new Date(stats.cooldown_until) > now) continue;

      let effectiveDailyLimit = dailyLimit;
      if (stats.warmup_day !== null && stats.warmup_day !== undefined && stats.warmup_day >= 0) {
        const warmupLimits = [20, 50, 100, 200, 500];
        const idx = Math.min(stats.warmup_day, warmupLimits.length - 1);
        effectiveDailyLimit = Math.min(warmupLimits[idx], dailyLimit);
      }

      const currentBucket = brTime.getHours();
      let hourSent = stats.messages_sent_hour || 0;
      if (stats.hour_bucket !== currentBucket) {
        hourSent = 0;
        await supabase.from('campaign_instance_stats').update({
          hour_bucket: currentBucket, messages_sent_hour: 0, updated_at: new Date().toISOString(),
        }).eq('id', stats.id);
      }

      if (hourSent >= hourlyLimit) continue;
      if ((stats.messages_sent_day || 0) >= effectiveDailyLimit) continue;
      availableInstances.push(instId);
    } else {
      await supabase.from('campaign_instance_stats').insert({
        tenant_id: campaign.tenant_id,
        instance_id: instId, date: today,
        hour_bucket: brTime.getHours(), messages_sent_hour: 0, messages_sent_day: 0, blocks_detected_day: 0,
      });
      availableInstances.push(instId);
    }
  }

  if (availableInstances.length === 0) {
    return { processed: 0, reason: 'all_instances_at_limit' };
  }

  // STALE LOCK RECOVERY: Leads presos em 'sending' por >5min = processor anterior deu timeout/crash
  // Resetar para 'pending' para desbloquear o pipeline
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: staleLeads } = await supabase
    .from('campaign_leads')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('status', 'sending')
    .lt('updated_at', fiveMinAgo);

  if (staleLeads && staleLeads.length > 0) {
    const staleIds = staleLeads.map((s: any) => s.id);
    await supabase.from('campaign_leads').update({
      status: 'pending', updated_at: new Date().toISOString(),
    }).in('id', staleIds);
    console.log(`[Processor] Campaign ${campaign.id}: recovered ${staleIds.length} stale leads (stuck >5min)`);
  }

  // LOCK: Se ainda tem leads RECENTES em 'sending', outro processor está ativo — não pegar novo batch
  const { count: sendingCount } = await supabase
    .from('campaign_leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'sending');

  if (sendingCount && sendingCount > 0) {
    console.log(`[Processor] Campaign ${campaign.id}: ${sendingCount} leads actively sending — skipping`);
    return { processed: 0, reason: 'batch_already_processing' };
  }

  // BATCH SIZE depende do provider:
  //   UAZAPI: 2 (delays de 45-90s por lead — 2 leads + 1 delay ≈ 90-135s, cabe no timeout 150s)
  //   Cloud API: 50 (sem delay — Meta tem rate-limiting próprio, processa em paralelo rápido)
  const batchSize = isCloudApi ? 50 : 2;
  const { data: pendingLeads, error: plErr } = await supabase
    .from('campaign_leads')
    .select('*, lead:leads(id, name, phone, email, city_name, state, company_name, sales_rep_id)')
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (plErr) throw plErr;
  if (!pendingLeads || pendingLeads.length === 0) {
    const { count: remainingCount } = await supabase
      .from('campaign_leads')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .in('status', ['pending', 'sending']);

    if (!remainingCount || remainingCount === 0) {
      await supabase.from('campaigns').update({
        status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', campaign.id);
    }
    return { processed: 0, reason: 'no_pending_leads' };
  }

  // FIX: Batch-lock all leads to 'sending' BEFORE processing to prevent concurrent duplicate sends
  const leadIds = pendingLeads.map((cl: any) => cl.id);
  await supabase.from('campaign_leads').update({
    status: 'sending', updated_at: new Date().toISOString(),
  }).in('id', leadIds);

  // Build message array for round-robin rotation
  const messages: string[] = (campaign.message_contents && campaign.message_contents.length > 0)
    ? campaign.message_contents
    : [campaign.message_content];

  let processed = 0;
  let skipped = 0;
  let instanceIndex = 0;

  for (let i = 0; i < pendingLeads.length; i++) {
    const cl = pendingLeads[i];
    const lead = cl.lead;
    if (!lead || !lead.phone) {
      await supabase.from('campaign_leads').update({
        status: 'skipped', error_message: !lead ? 'Lead nao encontrado' : 'Lead sem telefone', updated_at: new Date().toISOString(),
      }).eq('id', cl.id);
      skipped++;
      continue;
    }

    const selectedInstanceId = availableInstances[instanceIndex % availableInstances.length];
    instanceIndex++;

    // Round-robin: pick message based on total processed so far (sent_count + current index)
    const messageIndex = (totalSent + processed) % messages.length;
    const selectedTemplate = messages[messageIndex];
    const resolvedMessage = resolveVariables(selectedTemplate, lead);

    console.log(`[Processor] Lead ${lead.id}: using message variation ${messageIndex + 1}/${messages.length}`);

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('api_key, api_url, name, provider, phone_number_id')
      .eq('id', selectedInstanceId)
      .single();

    if (!instance?.api_key) {
      await supabase.from('campaign_leads').update({
        status: 'failed', error_message: 'Instance sem api_key', failed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', cl.id);
      continue;
    }

    // Update with resolved message and instance
    await supabase.from('campaign_leads').update({
      instance_id: selectedInstanceId, resolved_message: resolvedMessage, updated_at: new Date().toISOString(),
    }).eq('id', cl.id);

    try {
      const formattedPhone = formatPhone(lead.phone);
      const isCloudApi = (campaign.provider || 'uazapi') === 'cloud_api';

      console.log(`[Processor] Sending to ${formattedPhone} via ${instance.name} (${isCloudApi ? 'cloud_api' : 'uazapi'})`);

      let sendResp: Response;
      let sendResult: any;
      let uazResult: { success: boolean; messageId: string };

      if (isCloudApi) {
        // === Cloud API Meta: envia template aprovado via send-whatsapp-cloud ===
        // send-whatsapp-cloud espera template_name (string Meta) + template_language,
        // não template_id (UUID do banco). Busca os dados do template.
        const { data: cloudTpl } = await supabase
          .from('whatsapp_cloud_templates')
          .select('name, language, status')
          .eq('id', campaign.cloud_template_id)
          .single();

        if (!cloudTpl?.name) {
          await supabase.from('campaign_leads').update({
            status: 'failed',
            error_message: `Template Meta nao encontrado (id=${campaign.cloud_template_id})`,
            failed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', cl.id);
          continue;
        }
        if (cloudTpl.status?.toUpperCase() !== 'APPROVED') {
          await supabase.from('campaign_leads').update({
            status: 'failed',
            error_message: `Template ${cloudTpl.name} nao esta APPROVED (status=${cloudTpl.status})`,
            failed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', cl.id);
          continue;
        }

        const templateParams = buildTemplateParams(campaign.cloud_template_params || [], lead);
        sendResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-whatsapp-cloud`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            instance_id: selectedInstanceId,
            action: 'send_template',
            phone: formattedPhone,
            template_name: cloudTpl.name,
            template_language: cloudTpl.language || 'pt_BR',
            template_params: templateParams,
            lead_id: lead.id,
            sent_by: 'campaign',
            campaign_id: campaign.id,
          }),
        });
        sendResult = await sendResp.json();
        console.log(`[Processor] Cloud API response:`, JSON.stringify(sendResult).slice(0, 300));
        uazResult = {
          success: sendResp.ok && !sendResult.error,
          messageId: sendResult.message_id || sendResult.messages?.[0]?.id || '',
        };
      } else {
        // === UAZAPI: envia texto livre ===
        // IMPORTANTE: api_url deve estar configurada em whatsapp_instances.api_url.
        // Sem isso, o envio falha — não use fallback hardcoded em produção.
        const apiUrl = instance.api_url;
        if (!apiUrl) {
          throw new Error('whatsapp_instances.api_url não configurada para esta instância UAZAPI');
        }
        sendResp = await fetch(`${apiUrl}/send/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instance.api_key },
          body: JSON.stringify({ number: formattedPhone, text: resolvedMessage }),
        });
        sendResult = await sendResp.json();
        console.log(`[Processor] UAZAPI response:`, JSON.stringify(sendResult).slice(0, 300));
        uazResult = isUazapiSuccess(sendResp, sendResult);
      }

      if (uazResult.success) {
        // Mark as sent
        await supabase.from('campaign_leads').update({
          status: 'sent', whatsapp_message_id: uazResult.messageId,
          sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', cl.id);

        // Increment sent_count
        try {
          await supabase.rpc('increment_campaign_counter', { p_campaign_id: campaign.id, p_field: 'sent_count' });
        } catch {
          const { data: cData } = await supabase.from('campaigns').select('sent_count').eq('id', campaign.id).single();
          await supabase.from('campaigns').update({ sent_count: (cData?.sent_count || 0) + 1, updated_at: new Date().toISOString() }).eq('id', campaign.id);
        }

        // Update instance stats
        const { data: currentStats } = await supabase
          .from('campaign_instance_stats')
          .select('id, messages_sent_hour, messages_sent_day')
          .eq('instance_id', selectedInstanceId)
          .eq('date', today)
          .maybeSingle();

        if (currentStats) {
          await supabase.from('campaign_instance_stats').update({
            messages_sent_hour: (currentStats.messages_sent_hour || 0) + 1,
            messages_sent_day: (currentStats.messages_sent_day || 0) + 1,
            updated_at: new Date().toISOString(),
          }).eq('id', currentStats.id);
        }

        // Create timeline entry
        try {
          await supabase.from('company_activities').insert({
            tenant_id: campaign.tenant_id,
            lead_id: lead.id,
            name: `Campanha '${campaign.name}' \u2014 mensagem enviada`,
            description: resolvedMessage.slice(0, 200),
            task_type: 'whatsapp',
            team: 'sales',
            completed: true,
            completed_at: new Date().toISOString(),
            scheduled_at: new Date().toISOString(),
            metadata: { campaign_id: campaign.id, campaign_name: campaign.name, campaign_event: 'sent', instance_id: selectedInstanceId, message_variation: messageIndex + 1 },
          });
        } catch (timelineErr) {
          console.error('[Processor] Timeline error (non-fatal):', timelineErr);
        }

        processed++;
      } else {
        // FIX: Ensure errorMsg is always a string (sendResult.error can be boolean true)
        const rawError = sendResult.message || (typeof sendResult.error === 'string' ? sendResult.error : null) || JSON.stringify(sendResult).slice(0, 500);
        const errorMsg = String(rawError);
        const isBlocked = errorMsg.toLowerCase().includes('block') || errorMsg.toLowerCase().includes('ban') || sendResp.status === 403;
        const isDisconnected = isDisconnectedError(sendResp, sendResult, errorMsg);

        // Desconectada = tratar como cooldown (não desperdiçar leads)
        if (isDisconnected) {
          console.log(`[Processor] Instance ${instance.name} appears DISCONNECTED. Putting in 1h cooldown.`);

          // Reverter lead para pending — a instância não entregou
          await supabase.from('campaign_leads').update({
            status: 'pending', error_message: null,
            updated_at: new Date().toISOString(),
          }).eq('id', cl.id);

          // Cooldown de 1h para desconexão (menor que block=24h, pois pode reconectar rápido)
          const { data: dStats } = await supabase.from('campaign_instance_stats')
            .select('id, blocks_detected_day')
            .eq('instance_id', selectedInstanceId).eq('date', today).maybeSingle();
          if (dStats) {
            await supabase.from('campaign_instance_stats').update({
              cooldown_until: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // 1h
              updated_at: new Date().toISOString(),
            }).eq('id', dStats.id);
          }

          // Atualizar status da instância no banco
          await supabase.from('whatsapp_instances').update({
            status: 'disconnected', updated_at: new Date().toISOString(),
          }).eq('id', selectedInstanceId);

          // Remover esta instância das disponíveis para o restante do batch
          const idxToRemove = availableInstances.indexOf(selectedInstanceId);
          if (idxToRemove >= 0) availableInstances.splice(idxToRemove, 1);

          if (availableInstances.length === 0) {
            console.log('[Processor] All instances disconnected/unavailable. Stopping batch.');
            // Reverter leads restantes que foram locked para 'sending'
            const remainingIds = pendingLeads.slice(i + 1).map((r: any) => r.id);
            if (remainingIds.length > 0) {
              await supabase.from('campaign_leads').update({
                status: 'pending', updated_at: new Date().toISOString(),
              }).in('id', remainingIds);
            }
            break;
          }

          continue;
        }

        await supabase.from('campaign_leads').update({
          status: isBlocked ? 'blocked' : 'failed',
          error_message: errorMsg.slice(0, 500),
          failed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', cl.id);

        const counterField = isBlocked ? 'blocked_count' : 'failed_count';
        try {
          await supabase.rpc('increment_campaign_counter', { p_campaign_id: campaign.id, p_field: counterField });
        } catch {
          const { data: cData } = await supabase.from('campaigns').select(counterField).eq('id', campaign.id).single();
          await supabase.from('campaigns').update({ [counterField]: (cData?.[counterField] || 0) + 1, updated_at: new Date().toISOString() }).eq('id', campaign.id);
        }

        if (isBlocked) {
          const { data: blockStats } = await supabase.from('campaign_instance_stats').select('id, blocks_detected_day').eq('instance_id', selectedInstanceId).eq('date', today).maybeSingle();
          if (blockStats) {
            await supabase.from('campaign_instance_stats').update({
              blocks_detected_day: (blockStats.blocks_detected_day || 0) + 1,
              last_block_at: new Date().toISOString(),
              cooldown_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', blockStats.id);
          }
        }
      }
    } catch (sendErr: any) {
      console.error(`[Processor] Send error for lead ${lead.id}:`, sendErr);
      await supabase.from('campaign_leads').update({
        status: 'failed', error_message: sendErr.message?.slice(0, 500) || 'Unknown send error',
        failed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', cl.id);

      try {
        await supabase.rpc('increment_campaign_counter', { p_campaign_id: campaign.id, p_field: 'failed_count' });
      } catch {
        const { data: cData } = await supabase.from('campaigns').select('failed_count').eq('id', campaign.id).single();
        await supabase.from('campaigns').update({ failed_count: (cData?.failed_count || 0) + 1, updated_at: new Date().toISOString() }).eq('id', campaign.id);
      }
    }

    // Delay entre leads (não após o último — economiza timeout)
    // Cloud API (Meta) NÃO precisa de delay — Meta tem rate-limiting próprio.
    if (i < pendingLeads.length - 1 && !isCloudApi) {
      const delayMin = campaign.delay_min_seconds || 45;
      const delayMax = campaign.delay_max_seconds || 90;
      const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
      console.log(`[Processor] Waiting ${delay}s before next lead...`);
      await sleep(delay * 1000);
    }
  }

  console.log(`[Processor] Campaign ${campaign.id}: processed ${processed}, skipped ${skipped}, variations: ${messages.length}`);
  return { processed, skipped };
}

// Normaliza nome: "G A B R I E L" → "Gabriel", "PAULO" → "Paulo", "maria" → "Maria"
function normalizeName(raw: string): string {
  if (!raw) return '';
  // Remove espaços entre letras isoladas: "G A B R I E L" → "GABRIEL"
  let name = raw.trim();
  if (/^[A-Za-zÀ-ú]( [A-Za-zÀ-ú]){2,}$/.test(name)) {
    name = name.replace(/ /g, '');
  }
  // Title case: "PAULO SILVA" → "Paulo Silva", "maria" → "Maria"
  return name
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_m, space, letter) => space + letter.toUpperCase())
    // Preposições minúsculas
    .replace(/\s(Da|De|Do|Das|Dos|E)\s/g, (m) => m.toLowerCase());
}

function resolveVariables(template: string, lead: any): string {
  let msg = template;
  const fullName = normalizeName(lead.name || '');
  const firstName = fullName.split(' ')[0];
  msg = msg.replace(/\{\{nome\}\}/g, fullName);
  msg = msg.replace(/\{\{primeiro_nome\}\}/g, firstName);
  msg = msg.replace(/\{\{email\}\}/g, lead.email || '');
  msg = msg.replace(/\{\{telefone\}\}/g, lead.phone || '');
  msg = msg.replace(/\{\{cidade\}\}/g, lead.city_name || '');
  msg = msg.replace(/\{\{estado\}\}/g, lead.state || '');
  msg = msg.replace(/\{\{empresa\}\}/g, lead.company_name || '');
  return msg;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Constrói o array de parâmetros para template Meta a partir do mapeamento da campanha.
 * Cada parâmetro pode ser:
 *   - { type: 'static', value: 'texto fixo' }
 *   - { type: 'lead_field', value: 'name' | 'phone' | 'city_name' | 'state' | 'company_name' | ... }
 *
 * Retorna array ordenado por index (1, 2, 3...) com valores resolvidos:
 *   [{ type: 'text', text: 'valor1' }, { type: 'text', text: 'valor2' }, ...]
 */
function buildTemplateParams(paramConfig: any[], lead: any): any[] {
  if (!Array.isArray(paramConfig) || paramConfig.length === 0) return [];

  const sorted = [...paramConfig].sort((a, b) => (a.index || 0) - (b.index || 0));
  const fullName = normalizeName(lead.name || '');
  const firstName = fullName.split(' ')[0];

  return sorted.map((p: any) => {
    let value = '';
    if (p.type === 'static') {
      value = String(p.value || '');
    } else if (p.type === 'lead_field') {
      const field = String(p.value || '');
      switch (field) {
        case 'nome':
        case 'name':
          value = fullName;
          break;
        case 'primeiro_nome':
        case 'first_name':
          value = firstName;
          break;
        case 'email':           value = lead.email || ''; break;
        case 'telefone':
        case 'phone':           value = lead.phone || ''; break;
        case 'cidade':
        case 'city_name':       value = lead.city_name || ''; break;
        case 'estado':
        case 'state':           value = lead.state || ''; break;
        case 'empresa':
        case 'company_name':    value = lead.company_name || ''; break;
        default:                value = String(lead[field] || '');
      }
    }
    return { type: 'text', text: value || '_' }; // Meta rejeita strings vazias em template
  });
}
