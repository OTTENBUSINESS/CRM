export async function getOrCreateGroup(
  supabase: any,
  instanceId: string,
  whatsappGroupId: string,
  data: any
): Promise<string | null> {
  // Check if group exists - usar group_jid (coluna correta no banco)
  const { data: existingGroup } = await supabase
    .from('whatsapp_groups')
    .select('id')
    .eq('group_jid', whatsappGroupId)
    .eq('instance_id', instanceId)
    .single();

  if (existingGroup) {
    return existingGroup.id;
  }

  // Create new group entry - usar group_jid (coluna correta no banco)
  const { data: newGroup, error } = await supabase
    .from('whatsapp_groups')
    .insert({
      instance_id: instanceId,
      group_jid: whatsappGroupId,
      name: data.groupName || data.subject || 'Grupo WhatsApp',
      group_type: 'customer',
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('[Webhook] Error creating group:', error);
    return null;
  }

  return newGroup.id;
}
