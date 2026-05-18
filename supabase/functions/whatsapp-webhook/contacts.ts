import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Upload foto do WhatsApp pro Supabase Storage (não expira)
async function uploadAvatarToStorage(imageUrl: string, leadId: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size < 100) return null; // imagem vazia/placeholder

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const path = `avatars/${leadId}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('profile-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) {
      console.error('[Webhook] Avatar upload error:', error.message);
      return null;
    }
    const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(path);
    console.log('[Webhook] Avatar uploaded:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (err: any) {
    console.error('[Webhook] Avatar upload failed:', err.message);
    return null;
  }
}

// Buscar detalhes completos do contato via UAZAPI
export async function fetchContactDetailsFromUazapi(
  phone: string,
  apiKey: string | null,
  apiUrl: string | null
): Promise<{ name: string | null; avatar: string | null } | null> {
  if (!apiKey || !phone || !apiUrl) return null;

  try {
    const cleanPhone = phone.replace(/\D/g, '');

    console.log('[Webhook] Fetching contact details for:', cleanPhone);

    const response = await fetch(`${apiUrl}/chat/details`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': apiKey,
      },
      body: JSON.stringify({ 
        number: cleanPhone,
        preview: false 
      }),
    });

    if (!response.ok) {
      console.log('[Webhook] Contact details fetch failed:', response.status);
      return null;
    }

    const data = await response.json();
    
    // Extrair nome e foto da resposta
    const name = data.name || data.wa_name || data.lead_fullName || data.lead_name || null;
    const avatar = data.image || data.imagePreview || null;
    
    console.log('[Webhook] Contact details result:', { name, hasAvatar: !!avatar });
    return { name, avatar };
  } catch (error) {
    console.error('[Webhook] Error fetching contact details:', error);
    return null;
  }
}

// Buscar ou criar lead com dados completos da UAZAPI
// REGRA: Busca pelos últimos 8 dígitos do telefone (da direita para esquerda)
// NOTA: Usa tabela 'leads' como entidade central (não 'contacts')
export async function getOrCreateContactWithProfilePic(
  supabase: any,
  phone: string,
  pushName: string,
  apiKey: string | null,
  apiUrl: string | null
): Promise<string | null> {
  const cleanPhone = phone.replace(/\D/g, '').replace(/@.*/, '');
  
  if (!cleanPhone) return null;

  // Pegar os últimos 8 dígitos para busca
  const last8Digits = cleanPhone.slice(-8);
  
  console.log('[Webhook] Searching lead by last 8 digits:', last8Digits);

  // Buscar lead existente pelos últimos 8 dígitos
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id, name, phone, photo_url')
    .ilike('phone', `%${last8Digits}`)
    .limit(1)
    .single();

  if (existingLead) {
    console.log('[Webhook] Found existing lead:', existingLead.id, 'phone:', existingLead.phone);

    // Auto-corrigir telefone se o número do WhatsApp (remote_jid) difere do banco
    // Isso resolve o problema do 9º dígito e outras divergências de formato
    const needsPhoneUpdate = existingLead.phone !== cleanPhone && cleanPhone.length >= 10;

    // Atualizar nome, foto e telefone se necessário
    const needsName = !existingLead.name || existingLead.name === cleanPhone;
    const needsPhoto = !existingLead.photo_url;

    const updates: Record<string, string> = {};

    if (needsPhoneUpdate) {
      updates.phone = cleanPhone;
      console.log(`[Webhook] 📞 Auto-corrigindo telefone do lead ${existingLead.id}: "${existingLead.phone}" → "${cleanPhone}" (fonte: WhatsApp JID)`);
    }

    if (apiKey && (needsName || needsPhoto)) {
      const details = await fetchContactDetailsFromUazapi(cleanPhone, apiKey, apiUrl);
      if (details) {
        if (needsName && details.name) updates.name = details.name;
        if (needsPhoto && details.avatar) {
          const storedUrl = await uploadAvatarToStorage(details.avatar, existingLead.id);
          if (storedUrl) updates.photo_url = storedUrl;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('leads')
        .update(updates)
        .eq('id', existingLead.id);
      console.log('[Webhook] Updated lead:', existingLead.id, Object.keys(updates));
    }

    return existingLead.id;
  }

  // Criar novo lead - buscar dados completos primeiro
  console.log('[Webhook] Creating new lead for:', cleanPhone);
  
  const details = await fetchContactDetailsFromUazapi(cleanPhone, apiKey, apiUrl);

  // Usar nome da UAZAPI, fallback para pushName, depois telefone
  const leadName = details?.name || pushName || cleanPhone;

  // Criar lead primeiro, depois upload da foto (precisa do ID)
  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({
      name: leadName,
      phone: cleanPhone,
    })
    .select()
    .single();

  if (error) {
    console.error('[Webhook] Error creating lead:', error);
    return null;
  }

  console.log('[Webhook] Created new lead:', newLead.id, 'name:', leadName);

  // Upload avatar em background (não bloqueia)
  if (details?.avatar && newLead?.id) {
    uploadAvatarToStorage(details.avatar, newLead.id).then(storedUrl => {
      if (storedUrl) {
        supabase.from('leads').update({ photo_url: storedUrl }).eq('id', newLead.id);
        console.log('[Webhook] Avatar saved for new lead:', newLead.id);
      }
    }).catch(() => {});
  }

  return newLead.id;
}
